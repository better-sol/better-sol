import { intro, log, outro, spinner } from "@clack/prompts";
import { execSync } from "node:child_process";
import type { VerifyOptions } from "../types";
import { CLI_COMMAND } from "./shared";

const OTTERSEC_API = "https://verify.osec.io";

export async function verify(programArg: string | undefined, options: VerifyOptions): Promise<void> {
  intro("better-sol verify");

  const programId = resolveProgramId(programArg, options);
  if (!isValidProgramId(programId)) {
    throw new Error(
      `Invalid program ID '${programId}'. Expected a base58 Solana address (32-44 characters).`,
    );
  }

  const s = spinner();

  s.start("Reading git repository state");
  const repository = await gitRemote();
  const commitHash = await gitCommit();
  s.stop(`Found ${repository} at ${commitHash.slice(0, 8)}`);

  const libName = options.libName ?? (programArg !== undefined ? programArg : programId);
  const mountPath = options.mountPath ?? `generated/${libName}`;

  log.info("Submission parameters:");
  log.step(`Program ID:  ${programId}`);
  log.step(`Repository:  ${repository}`);
  log.step(`Commit:      ${commitHash.slice(0, 8)}`);
  log.step(`Library:     ${libName}`);
  log.step(`Mount path:  ${mountPath}`);

  s.start("Submitting to OtterSec");
  await submitToOtterSec(programId, repository, commitHash, libName, mountPath);
  s.stop("Submitted");

  log.success("OtterSec will clone your repo and build the program in a deterministic Docker container.");
  log.step(`Status:  ${OTTERSEC_API}/status/${programId}`);
  log.step(`Logs:    ${OTTERSEC_API}/logs/${programId}`);
  log.info("Results are typically ready within 5 minutes. Once verified, a badge appears in Solana Explorer and SolanaFM.");

  outro("Verification submitted.");
}

function resolveProgramId(programArg: string | undefined, options: VerifyOptions): string {
  if (options.programId !== undefined) return options.programId.trim();
  if (programArg !== undefined) return programArg.trim();
  throw new Error(
    "Program ID is required.\n" +
      `Usage: ${CLI_COMMAND} verify <program-id>\n` +
      `       ${CLI_COMMAND} verify --program-id <id>`,
  );
}

function isValidProgramId(value: string): boolean {
  return value.length >= 32 && value.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

async function submitToOtterSec(
  programId: string,
  repository: string,
  commitHash: string,
  libName: string,
  mountPath: string,
): Promise<void> {
  const response = await fetch(`${OTTERSEC_API}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repository,
      program_id: programId,
      commit_hash: commitHash,
      lib_name: libName,
      mount_path: mountPath,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (response.ok) return;

  const errorText = await response.text();

  switch (response.status) {
    case 400:
      throw new Error(
        `OtterSec rejected the request: ${errorText}\n` +
        `Verify that the program ID is a valid mainnet program and the repository URL is accessible.`,
      );
    case 429:
      throw new Error(
        "OtterSec API rate limit exceeded (1 request per 30 seconds per IP). Wait before retrying.",
      );
    default:
      throw new Error(
        `OtterSec API returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
      );
  }
}

async function gitRemote(): Promise<string> {
  try {
    const value = execSync("git config --get remote.origin.url", { encoding: "utf8", timeout: 5000 }).trim();
    if (value.length === 0) throw new Error("empty remote");
    return value;
  } catch {
    throw new Error(
      "Could not determine git remote URL.\n" +
      "Prerequisites:\n" +
      "  1. The generated Rust code must be committed and pushed to a public repository\n" +
      "  2. A remote named 'origin' must be configured\n" +
      "  Run: git remote add origin <url>",
    );
  }
}

async function gitCommit(): Promise<string> {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    throw new Error(
      "Could not determine current commit hash. Make sure you are in a Git repository with at least one commit.",
    );
  }
}
