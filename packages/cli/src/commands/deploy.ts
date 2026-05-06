import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
import { execSync } from "node:child_process";
import { getStoredApiKey } from "../auth";
import { loadConfig, parseCluster } from "../config";
import { BETTER_SOL_DIR, cwdJoin, cwdPath, ensureDirectory } from "../path";
import type { DeployOptions } from "../types";
import { compileProgram, getApiUrl } from "../api/client";
import { generateAnchorProject } from "../generator/rust";
import { discoverProgramsWithSpinner, CLI_COMMAND } from "./shared";

export async function deploy(options: DeployOptions): Promise<void> {
  intro("better-sol deploy");

  const apiKey = await getStoredApiKey();

  const config = await loadConfig();
  const cluster = parseCluster(options.cluster, config.cluster);
  const src = options.src ?? config.programs;
  const out = options.output ?? config.out;
  const outDir = cwdPath(out);

  const programs = await discoverProgramsWithSpinner(src);

  const s = spinner();
  const matched =
    options.program !== undefined
      ? programs.filter((p) => p.name === options.program)
      : programs;
  if (options.program !== undefined && matched.length === 0) {
    s.stop("Program not found");
    const available = programs.map((p) => `  ${p.name}`).join("\n");
    throw new Error(
      `No program named '${options.program}' found in ${src}.\nAvailable programs:\n${available}`,
    );
  }

  const projects = matched.map((program) => generateAnchorProject(program));

  if (options.verify || options.dryRun || options.output !== undefined) {
    s.message(`Writing generated Anchor projects`);
    await ensureDirectory(outDir);
    await Promise.all(
      projects.map(async (project) => {
        const dir = join(outDir, project.program.name);
        await ensureDirectory(join(dir, "src"));
        writeFileSync(join(dir, "Cargo.toml"), project.cargoToml);
        writeFileSync(join(dir, "src", "lib.rs"), project.libRs);
      }),
    );
  }

  if (options.dryRun) {
    s.stop("Dry run complete");
    for (const project of projects)
      printProgramSummary(project.program, cluster, outDir, true);
    outro("Dry run complete — Rust written to disk. No compilation or deployment performed.");
    return;
  }

  s.message(`Compiling`);
  const compileResults = await Promise.all(
    projects.map((project) =>
      compileProgram({
        apiKey,
        program: project.program,
        libRs: project.libRs,
        cargoToml: project.cargoToml,
        idl: project.idl,
      }),
    ),
  );
  s.stop("Compilation completed");

  for (const [i, project] of projects.entries()) {
    const result = compileResults[i]!;

    printProgramSummary(project.program, cluster, outDir, options.verify);

    const statusLabel =
      result.status === "success" ? "✓ Success" : `✗ ${result.status}`;
    const compileTime = `${(result.compileTimeMs / 1000).toFixed(1)}s`;

    log.info(`${statusLabel} in ${compileTime}`);
    log.step(`Explorer:   ${getApiUrl()}/explore/${result.id}`);
    log.step(
      `Solana:     https://explorer.solana.com/address/${project.program.address}?cluster=${cluster}`,
    );

    if (result.status === "success" && result.bytecode !== null) {
      const soDir = join(outDir, project.program.name, "target", "deploy");
      const soPath = join(soDir, `${project.program.name}.so`);
      const keypairPath = cwdJoin(BETTER_SOL_DIR, `${project.program.name}.json`);

      mkdirSync(soDir, { recursive: true });
      writeFileSync(soPath, Buffer.from(result.bytecode, "base64"));

      s.message(`Deploying ${project.program.name} to ${cluster}`);
      const solanaPath = ensureSolanaCli(s);

      try {
        execSync(
          `"${solanaPath}" program deploy "${soPath}" --program-id "${keypairPath}" --url ${cluster}`,
          { encoding: "utf8", timeout: 120_000, stdio: "pipe" },
        );
        s.stop(`Deployed to ${cluster}`);
        log.step(`Deployed:   ${project.program.address}`);
      } catch (error) {
        s.stop("Deployment failed");
        const message =
          error instanceof Error && "stderr" in error
            ? (error as { readonly stderr: string }).stderr.trim()
            : String(error);
        throw new Error(`Deployment failed: ${message}`, { cause: error });
      }
    }
  }

  if (options.verify) {
    log.info("");
    log.info("To verify this build on-chain:");
    log.step(
      `1. Commit and push the ${out} directory to a public repository`,
    );
    log.step(
      `2. Run \`${CLI_COMMAND} verify ${matched[0]?.address ?? "<program-id>"}\``,
    );
  }

  outro("Deploy complete.");
}

const SOLANA_INSTALL_DIR = join(
  homedir(),
  ".local",
  "share",
  "solana",
  "install",
  "active_release",
  "bin",
);

function resolveSolanaBinary(): string | null {
  try {
    execSync("solana --version", { stdio: "ignore", timeout: 5000 });
    return "solana";
  } catch {
    const installed = join(SOLANA_INSTALL_DIR, "solana");
    try {
      execSync(`"${installed}" --version`, { stdio: "ignore", timeout: 5000 });
      return installed;
    } catch {
      return null;
    }
  }
}

function ensureSolanaCli(s: ReturnType<typeof spinner>): string {
  const existing = resolveSolanaBinary();
  if (existing) return existing;

  s.message("Installing Solana CLI");
  try {
    execSync(
      "sh -c \"$(curl -sSfL https://release.anza.xyz/stable/install)\"",
      { encoding: "utf8", timeout: 300_000, stdio: "pipe" },
    );
  } catch {
    s.stop("Installation failed");
    throw new Error(
      "Failed to install Solana CLI.\n" +
        "Install manually with: curl -sSfL https://release.anza.xyz/stable/install | sh",
    );
  }

  const installed = join(SOLANA_INSTALL_DIR, "solana");
  try {
    execSync(`"${installed}" --version`, { stdio: "ignore", timeout: 5000 });
    s.message("Solana CLI ready — deploying");
    return installed;
  } catch {
    s.stop("Binary not found after install");
    throw new Error(
      `Solana CLI installed but binary not found at: ${installed}\n` +
        "Try restarting your terminal, then re-run deploy.",
    );
  }
}

function printProgramSummary(
  program: { readonly name: string; readonly address: string },
  cluster: string,
  out: string,
  wroteRust: boolean,
): void {
  log.step(`Program:  ${program.address}`);
  log.step(`Cluster:  ${cluster}`);
  if (wroteRust) log.step(`Rust:     ${out}/${program.name}/`);
}
