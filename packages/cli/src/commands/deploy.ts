import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
import { execSync } from "node:child_process";
import { getStoredApiKey } from "../auth";
import { loadConfig, parseCluster } from "../config";
import { readKeypair } from "../keypair";
import { BETTER_SOL_DIR, cwdJoin, cwdPath, ensureDirectory, fileExists } from "../path";
import type { Cluster, DeployOptions } from "../types";
import { compileProgram, getApiUrl } from "../api/client";
import { generateAnchorProject } from "../generator/rust";
import { discoverProgramsWithSpinner, CLI_COMMAND } from "./shared";

const DEFAULT_PAYER_PATH = "keypair.json";
const SOLANA_DEFAULT_KEYPAIR = join(homedir(), ".config", "solana", "id.json");
const AIRDROP_LAMPORTS = 2_000_000_000n;
const MIN_DEPLOY_BALANCE = 1_500_000_000n;

const CLUSTER_URLS: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

export async function deploy(options: DeployOptions): Promise<void> {
  intro("better-sol deploy");

  const apiKey = await getStoredApiKey();

  const config = await loadConfig();
  const cluster = parseCluster(options.cluster, config.cluster);
  const src = options.src ?? config.programs;
  const out = options.output ?? config.out;
  const outDir = cwdPath(out);

  const payerPath = resolvePayerPath(options.payer);
  const payer = await readKeypair(payerPath);
  const clusterUrl = CLUSTER_URLS[cluster];

  await ensureFunded(payer.publicKey, cluster, clusterUrl);

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
      const programKeypairPath = cwdJoin(BETTER_SOL_DIR, `${project.program.name}.json`);

      mkdirSync(soDir, { recursive: true });
      writeFileSync(soPath, Buffer.from(result.bytecode, "base64"));

      s.message(`Deploying ${project.program.name} to ${cluster}`);
      const solanaPath = ensureSolanaCli(s);

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

function resolvePayerPath(payerFlag: string | undefined): string {
  if (payerFlag !== undefined) return cwdPath(payerFlag);
  if (fileExists(cwdJoin(DEFAULT_PAYER_PATH))) return cwdJoin(DEFAULT_PAYER_PATH);
  if (existsSync(SOLANA_DEFAULT_KEYPAIR)) return SOLANA_DEFAULT_KEYPAIR;
  throw new Error(
    `No payer keypair found. Run \`${CLI_COMMAND} init\` to create one, or use --payer <path>.`,
  );
}

async function ensureFunded(address: string, cluster: Cluster, clusterUrl: string): Promise<void> {
  const s = spinner();
  s.start(`Checking balance for ${address.slice(0, 8)}...`);

  const balance = await getBalance(address, clusterUrl);

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

  try {
    const signature = await requestAirdrop(address, clusterUrl, AIRDROP_LAMPORTS);
    await confirmAirdrop(signature, clusterUrl);
    const newBalance = await getBalance(address, clusterUrl);
    s.stop(`Funded. Balance: ${(Number(newBalance) / 1e9).toFixed(2)} SOL`);
  } catch {
    s.stop("Airdrop failed");
    throw new Error(`Failed to airdrop SOL on ${cluster}. Fund ${address} manually or try again.`);
  }
}

async function getBalance(address: string, clusterUrl: string): Promise<bigint> {
  const response = await fetch(clusterUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
  });
  const result = (await response.json()) as { result?: { value?: number | string } };
  if (result.result?.value === undefined) throw new Error("Failed to get balance");
  return BigInt(result.result.value);
}

async function requestAirdrop(address: string, clusterUrl: string, lamports: bigint): Promise<string> {
  const response = await fetch(clusterUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "requestAirdrop", params: [address, Number(lamports)] }),
  });
  const result = (await response.json()) as { result?: string; error?: { message: string } };
  if (result.error !== undefined) throw new Error(result.error.message);
  if (result.result === undefined) throw new Error("No airdrop signature returned");
  return result.result;
}

async function confirmAirdrop(signature: string, clusterUrl: string): Promise<void> {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    // oxlint-disable-next-line no-await-in-loop — intentional polling for confirmation
    const response = await fetch(clusterUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignatureStatuses", params: [[signature]] }),
    });
    // oxlint-disable-next-line no-await-in-loop — intentional polling for confirmation
    const result = (await response.json()) as { result?: { value?: Array<{ confirmationStatus?: string } | null> } };
    const status = result.result?.value?.[0];
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    // oxlint-disable-next-line no-await-in-loop — intentional sleep between polling retries
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Airdrop confirmation timed out");
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
