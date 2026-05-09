import { writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { intro, log, outro, spinner } from "@clack/prompts";
import { execFile } from "node:child_process";
import { getStoredApiKey } from "#lib/auth";
import { loadConfig, parseCluster } from "#lib/config";
import { readKeypair } from "#lib/keypair";
import { BETTER_SOL_DIR, cwdJoin, cwdPath, ensureDirectory, fileExists } from "#lib/fs";
import { compileProgram, type CompileResponse } from "#lib/api";
import { clusterUrl, getBalance, requestAirdrop, confirmSignature } from "#lib/solana-rpc";
import { ensureSolanaCli } from "#lib/solana-cli";
import type { Cluster, DeployOptions } from "#lib/types";
import { generateAnchorProject } from "#generator/rust";
import { discoverProgramsWithSpinner, CLI_COMMAND } from "./shared";

const execFileAsync = promisify(execFile);

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

  const writesRust = options.verify || options.dryRun || options.output !== undefined;

  log.step(`Cluster: ${cluster}`);
  log.step(`Source:  ${src}`);
  if (writesRust) log.step(`Output:  ${out}`);

  await ensureFunded(payer.publicKey, cluster, rpcUrl);

  const programs = await discoverProgramsWithSpinner(src);

  const matched =
    options.program !== undefined
      ? programs.filter((p) => p.name === options.program)
      : programs;
  if (options.program !== undefined && matched.length === 0) {
    const available = programs.map((p) => `  ${p.name}`).join("\n");
    throw new Error(
      `No program named '${options.program}' found in ${src}.\nAvailable programs:\n${available}`,
    );
  }

  const projects = matched.map((program) => generateAnchorProject(program));
  await Promise.all(projects.map((project) => removeGeneratedSoFile(outDir, project.program.name)));

  if (writesRust) {
    const writeSpinner = spinner();
    writeSpinner.start("Writing generated Anchor projects");
    await ensureDirectory(outDir);
    await Promise.all(
      projects.map(async (project) => {
        const dir = join(outDir, project.program.name);
        await ensureDirectory(join(dir, "src"));
        writeFileSync(join(dir, "Cargo.toml"), project.cargoToml);
        writeFileSync(join(dir, "src", "lib.rs"), project.libRs);
      }),
    );
    writeSpinner.stop("Generated Anchor projects written");
  }

  if (options.dryRun) {
    for (const project of projects)
      printProgramSummary(project.program, cluster, outDir, true);
    outro(`Dry run complete — Rust written to ${out}/. No compilation or deployment performed.`);
    return;
  }

  const compileSpinner = spinner();
  compileSpinner.start(`Compiling ${matched.length === 1 ? matched[0]?.name : matched.length + " programs"} with Better Sol compiler`);
  let compileResults: readonly CompileResponse[];
  try {
    compileResults = await Promise.all(
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
    compileSpinner.stop("Compilation completed");
  } catch (error) {
    compileSpinner.stop("Compilation failed");
    throw error;
  }

  for (const [i, project] of projects.entries()) {
    const result = compileResults[i]!;
    const compileTime = `${(result.compileTimeMs / 1000).toFixed(1)}s`;

    log.info(`Program: ${project.program.name}`);
    log.step(`Address:  ${project.program.address}`);

    if (result.status === "failed" || result.bytecode === null) {
      const logs = result.logs !== undefined && result.logs.length > 0 ? `\n${result.logs}` : "";
      throw new Error(`Compilation failed for ${project.program.name}.${logs}`);
    }

    log.step(`Compiled: ${compileTime}`);

    const programKeypairPath = cwdJoin(BETTER_SOL_DIR, `${project.program.name}.json`);
    const solanaPath = ensureSolanaCli();
    const deploySpinner = spinner();
    deploySpinner.start(`Deploying ${project.program.name} to ${cluster}`);

    try {
      const signature = await deployCompiledProgram({
        bytecode: result.bytecode,
        programName: project.program.name,
        programKeypairPath,
        payerPath,
        cluster,
        solanaPath,
      });
      deploySpinner.stop("Deployment completed");
      log.step(`Signature: ${signature}`);
      log.step(
        `Explorer:  https://explorer.solana.com/address/${project.program.address}?cluster=${cluster}`,
      );
    } catch (error) {
      deploySpinner.stop("Deployment failed");
      throw new Error(`Deployment failed: ${extractProcessErrorMessage(error)}`, { cause: error });
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

async function removeGeneratedSoFile(outDir: string, programName: string): Promise<void> {
  await rm(join(outDir, programName, "target", "deploy", `${programName}.so`), { force: true });
}

async function deployCompiledProgram(params: {
  readonly bytecode: string;
  readonly programName: string;
  readonly programKeypairPath: string;
  readonly payerPath: string;
  readonly cluster: Cluster;
  readonly solanaPath: string;
}): Promise<string> {
  const deployDir = await mkdtemp(join(tmpdir(), "better-sol-deploy-"));
  const soPath = join(deployDir, `${params.programName}.so`);

  try {
    writeFileSync(soPath, Buffer.from(params.bytecode, "base64"));
    const { stdout } = await execFileAsync(
      params.solanaPath,
      [
        "program",
        "deploy",
        soPath,
        "--program-id",
        params.programKeypairPath,
        "--keypair",
        params.payerPath,
        "--url",
        params.cluster,
      ],
      { encoding: "utf8", timeout: 120_000 },
    );
    return extractDeploymentSignature(stdout);
  } finally {
    await rm(deployDir, { recursive: true, force: true });
  }
}

function extractDeploymentSignature(stdout: string): string {
  const signatureLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("Signature:"));
  return signatureLine?.replace("Signature:", "").trim() ?? "submitted";
}

function extractProcessErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.stderr === "string" && record.stderr.trim().length > 0) return record.stderr.trim();
    if (typeof record.stdout === "string" && record.stdout.trim().length > 0) return record.stdout.trim();
  }
  return error instanceof Error ? error.message : String(error);
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
