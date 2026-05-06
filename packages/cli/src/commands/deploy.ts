import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { confirm, intro, log, outro, spinner } from "@clack/prompts";
import { execSync } from "node:child_process";
import { getStoredApiKey } from "../auth";
import { loadConfig, parseCluster } from "../config";
import { ensureDirectory } from "../path";
import type { DeployOptions } from "../types";
import { discoverPrograms } from "../parser/discover";
import { compileProgram, getApiUrl } from "../api/client";
import { generateAnchorProject } from "../generator/rust";

export async function deploy(options: DeployOptions): Promise<void> {
  intro("better-sol deploy");

  const apiKey = await getStoredApiKey();
  if (!options.dryRun && !apiKey) {
    throw new Error("No API key found. Run `better-sol login` first.");
  }

  const config = await loadConfig();
  const cluster = parseCluster(options.cluster, config.cluster);
  const src = options.src ?? config.programs;
  const out = options.output ?? config.out;
  const outDir = out.startsWith("/") ? out : join(process.cwd(), out);

  const s = spinner();
  s.start(`Discovering programs from ${src}`);
  const programs = await discoverPrograms(src);
  if (programs.length === 0) {
    s.stop("No programs found");
    throw new Error(`No program() definitions found in ${src}`);
  }

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
        await writeFile(join(dir, "Cargo.toml"), project.cargoToml);
        await writeFile(join(dir, "src", "lib.rs"), project.libRs);
      }),
    );
  }

  if (options.dryRun) {
    s.stop("Dry run complete");
    for (const project of projects)
      printProgramSummary(project.program, cluster, outDir, true);
    outro("Generated Anchor Rust only. No compile or deploy performed.");
    return;
  }

  s.message(`Compiling`);
  const compileResults = await Promise.all(
    projects.map((project) =>
      compileProgram({
        apiKey: apiKey!,
        program: project.program,
        libRs: project.libRs,
        cargoToml: project.cargoToml,
        idl: project.idl,
      }),
    ),
  );
  s.stop("Compilation completed");

  for (const [i, project] of projects.entries()) {
    const result = compileResults[i];
    if (result === undefined) continue;

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
      const keypairPath = join(process.cwd(), ".better-sol", `${project.program.name}.json`);

      await mkdir(soDir, { recursive: true });
      await writeFile(soPath, Buffer.from(result.bytecode, "base64"));

      s.message(`Deploying ${project.program.name} to ${cluster}`);

      if (!solanaCliInstalled()) {
        s.stop("solana CLI not found");

        const shouldInstall = await confirm({
          message: "Install Solana CLI automatically?",
          initialValue: true,
        });

        if (shouldInstall) {
          s.start("Installing Solana CLI");
          try {
            execSync(
              "sh -c \"$(curl -sSfL https://release.anza.xyz/stable/install)\"",
              { encoding: "utf8", timeout: 300_000, stdio: "pipe" },
            );
            s.stop("Solana CLI installed");
            log.warn(
              "Restart your terminal or run `source ~/.zshrc` (or `source ~/.bashrc`) for PATH to take effect, then re-run deploy.",
            );
            outro("PATH updated — re-run deploy after restarting your terminal.");
            return;
          } catch {
            s.stop("Installation failed");
            log.warn("Install manually:");
            log.step(
              "sh -c \"$(curl -sSfL https://release.anza.xyz/stable/install)\"",
            );
          }
        } else {
          log.info("Install Solana CLI manually:");
          log.step(
            "sh -c \"$(curl -sSfL https://release.anza.xyz/stable/install)\"",
          );
        }

        log.info("Then deploy:");
        log.step(
          `solana program deploy "${soPath}" --program-id "${keypairPath}" --url ${cluster}`,
        );
        continue;
      }

      try {
        execSync(
          `solana program deploy "${soPath}" --program-id "${keypairPath}" --url ${cluster}`,
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
        throw new Error(`Deployment failed: ${message}`);
      }
    }
  }

  if (options.verify) {
    log.info("");
    log.info("To verify this build on-chain:");
    log.step(
      "1. Commit and push the generated/ directory to a public repository",
    );
    log.step(
      `2. Run \`better-sol verify ${matched[0]?.address ?? "<program-id>"}\``,
    );
  }

  outro("Compile completed.");
}

function solanaCliInstalled(): boolean {
  try {
    execSync("solana --version", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function printProgramSummary(
  program: { readonly name: string; readonly address: string },
  cluster: string,
  out: string,
  wroteRust: boolean,
): void {
  log.info(
    [
      `${program.name}`,
      `Program: ${program.address}`,
      `Cluster: ${cluster}`,
      wroteRust ? `Generated Rust: ${out}/${program.name}/` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  );
}
