import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
import { execSync } from "node:child_process";
import { getStoredApiKey } from "#lib/auth";
import { loadConfig, parseCluster } from "#lib/config";
import { readKeypair } from "#lib/keypair";
import { BETTER_SOL_DIR, cwdJoin, cwdPath, ensureDirectory, fileExists } from "#lib/fs";
import { compileProgram } from "#lib/api";
import { clusterUrl, getBalance, requestAirdrop, confirmSignature } from "#lib/solana-rpc";
import { ensureSolanaCli } from "#lib/solana-cli";
import type { Cluster, DeployOptions } from "#lib/types";
import { generateAnchorProject } from "#generator/rust";
import { discoverProgramsWithSpinner, CLI_COMMAND } from "./shared";

const DEFAULT_PAYER_PATH = "keypair.json";
const AIRDROP_LAMPORTS = 2_000_000_000n;
const AIRDROP_RETRIES = 3;
const MIN_DEPLOY_BALANCE = 1_500_000_000n;

export async function deploy(options: DeployOptions): Promise<void> {
  intro("better-sol deploy");

  const apiKey = await getStoredApiKey();

  const config = await loadConfig();
  const cluster = parseCluster(options.cluster, config.cluster);
  const src = options.src ?? config.programs;
  const out = options.output ?? config.out;
  const outDir = cwdPath(out);

  const payerPath = resolvePayerPath(options.payer, config.payer);
  const payer = await readKeypair(payerPath);
  const rpcUrl = clusterUrl(cluster);

  log.step(`Cluster: ${cluster}`);
  log.step(`Source:  ${src}`);
  log.step(`Output:  ${out}`);

  await ensureFunded(payer.publicKey, cluster, rpcUrl);

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
    outro(`Dry run complete — Rust written to ${out}/. No compilation or deployment performed.`);
    return;
  }

  s.message(`Compiling ${matched.length === 1 ? matched[0]?.name : matched.length + " programs"}`);
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

    log.info(`${statusLabel} compiled in ${compileTime}`);
    if (result.status === "failed" && result.logs) {
      log.info(`Compile logs:\n${result.logs}`);
    }
    log.step(
      `Explorer:   https://explorer.solana.com/address/${project.program.address}?cluster=${cluster}`,
    );

    if (result.status === "success" && result.bytecode !== null) {
      const soDir = join(outDir, project.program.name, "target", "deploy");
      const soPath = join(soDir, `${project.program.name}.so`);
      const programKeypairPath = cwdJoin(BETTER_SOL_DIR, `${project.program.name}.json`);

      mkdirSync(soDir, { recursive: true });
      writeFileSync(soPath, Buffer.from(result.bytecode, "base64"));

      s.message(`Deploying ${project.program.name} to ${cluster}`);
      const solanaPath = ensureSolanaCli();

      try {
        execSync(
          `"${solanaPath}" program deploy "${soPath}" --program-id "${programKeypairPath}" --keypair "${payerPath}" --url ${cluster}`,
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
    log.info("To verify this build on-chain:");
    log.step(
      `1. Commit and push the ${out}/ directory to a public repository`,
    );
    log.step(
      `2. Run \`${CLI_COMMAND} verify ${matched[0]?.address ?? "<program-id>"}\``,
    );
  }

  outro("Deploy complete.");
}

function resolvePayerPath(payerFlag: string | undefined, configPayer: string | undefined): string {
  if (payerFlag !== undefined) return cwdPath(payerFlag);
  if (configPayer !== undefined) return configPayer;
  if (fileExists(cwdJoin(DEFAULT_PAYER_PATH))) return cwdJoin(DEFAULT_PAYER_PATH);
  throw new Error(
    `No payer keypair found. Run \`${CLI_COMMAND} init\` to create one, or use --payer <path>.`,
  );
}

async function ensureFunded(address: string, cluster: Cluster, rpcUrl: string): Promise<void> {
  const s = spinner();
  s.start(`Checking balance for ${address.slice(0, 8)}...`);

  const balance = await getBalance(address, rpcUrl);

  if (balance >= MIN_DEPLOY_BALANCE) {
    s.stop(`Balance: ${(Number(balance) / 1e9).toFixed(2)} SOL`);
    return;
  }

  if (cluster === "mainnet") {
    s.stop(`Balance: ${(Number(balance) / 1e9).toFixed(4)} SOL`);
    throw new Error(`Insufficient SOL for deployment. Fund ${address} and try again.`);
  }

  if (cluster === "localnet") {
    s.stop(`Balance: ${(Number(balance) / 1e9).toFixed(4)} SOL`);
    return;
  }

  s.message(`Low balance (${(Number(balance) / 1e9).toFixed(4)} SOL). Requesting airdrop on ${cluster}...`);

  for (let attempt = 1; attempt <= AIRDROP_RETRIES; attempt++) {
    try {
      const signature = await requestAirdrop(address, rpcUrl, AIRDROP_LAMPORTS);
      await confirmSignature(signature, rpcUrl);
      const newBalance = await getBalance(address, rpcUrl);
      s.stop(`Funded. Balance: ${(Number(newBalance) / 1e9).toFixed(2)} SOL`);
      return;
    } catch {
      if (attempt < AIRDROP_RETRIES) {
        s.message(`Airdrop attempt ${attempt} failed, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  s.stop("Airdrop failed");
  throw new Error(`Failed to airdrop SOL on ${cluster}. Fund ${address} manually or try again.`);
}

function printProgramSummary(
  program: { readonly name: string; readonly address: string },
  cluster: string,
  out: string,
  wroteRust: boolean,
): void {
  log.info(`Program: ${program.name}`);
  log.step(`Address:  ${program.address}`);
  log.step(`Cluster:  ${cluster}`);
  if (wroteRust) log.step(`Rust:     ${out}/${program.name}/`);
}
