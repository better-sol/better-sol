import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "./env";
import { ApiError } from "./errors";

const requestSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/),
  programId: z.string().min(32).max(44).regex(/^[a-zA-Z0-9]+$/),
  version: z.string().min(1),
  libRs: z.string().min(1).max(1_500_000),
  cargoToml: z.string().min(1),
});

export type CompileOutput = {
  readonly status: "success" | "failed";
  readonly compileTimeMs: number;
  readonly bytecode: string | null;
  readonly bytecodeSha256: string | null;
  readonly sourceSha256: string;
  readonly cargoToml: string;
  readonly logs: string;
};

export async function compile(input: unknown): Promise<CompileOutput> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw ApiError.invalid(parsed.error.message);

  const { name, libRs, cargoToml } = parsed.data;
  const started = performance.now();

  const sourceSha256 = sha256Hex(libRs + cargoToml);

  const { bytecode, logs } = env.ENABLE_BUILD
    ? await runBuild(name, libRs, cargoToml)
    : {
        bytecode: null,
        logs:
          "Build execution disabled. Set COMPILER_ENABLE_BUILD=true to run cargo build-sbf.",
      };

  return {
    status: bytecode !== null ? "success" : "failed",
    compileTimeMs: Math.round(performance.now() - started),
    bytecode,
    bytecodeSha256: bytecode !== null ? sha256Hex(bytecode) : null,
    sourceSha256,
    cargoToml,
    logs,
  };
}

async function runBuild(
  name: string,
  libRs: string,
  cargoToml: string,
): Promise<{ bytecode: string | null; logs: string }> {
  const tmpDir = `${Bun.env["TMPDIR"] ?? "/tmp"}/better-sol-${crypto.randomUUID()}`;

  try {
    await mkdir(`${tmpDir}/src`, { recursive: true });
    await mkdir(`${tmpDir}/.cargo`, { recursive: true });
    await Bun.write(`${tmpDir}/Cargo.toml`, cargoToml);
    await Bun.write(`${tmpDir}/src/lib.rs`, libRs);
    await Bun.write(`${tmpDir}/.cargo/config.toml`, buildCargoConfigToml());

    const proc = Bun.spawn(
      ["cargo", "build-sbf", "--manifest-path", `${tmpDir}/Cargo.toml`],
      {
        cwd: tmpDir,
        timeout: env.BUILD_TIMEOUT_SECS * 1000,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    await proc.exited;

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const logs = stdout + stderr;

    if (proc.exitCode !== 0) {
      throw ApiError.buildFailed(logs.trim());
    }

    const soPath = findProgramSoFile(tmpDir, name);
    if (!existsSync(soPath)) {
      return {
        bytecode: null,
        logs: `${logs.trim()}\nProgram artifact not found at target/deploy/${name}.so`,
      };
    }

    normalizeSolanaElf(soPath);

    const bytes = await Bun.file(soPath).bytes();
    const bytecode = Buffer.from(bytes).toString("base64");

    return { bytecode, logs: logs.trim() };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function buildCargoConfigToml(): string {
  return `[target.sbpf-solana-solana]
rustflags = ["-C", "link-arg=--build-id=none"]
`;
}

function findProgramSoFile(tmpDir: string, programName: string): string {
  return join(tmpDir, "target", "deploy", `${programName}.so`);
}

function normalizeSolanaElf(soPath: string): void {
  const objcopy = resolveSolanaObjcopy();
  if (objcopy === null) {
    throw ApiError.buildFailed("Solana platform-tools llvm-objcopy was not found in ~/.cache/solana. Run cargo build-sbf once to install platform tools.");
  }

  const removableSections = [
    ".note.gnu.build-id",
    ".gcc_except_table",
    ".eh_frame_hdr",
    ".eh_frame",
    ".gnu.version",
    ".gnu.version_r",
    ".gnu.hash",
    ".comment",
    ".rustc",
  ];

  try {
    execFileSync(
      objcopy,
      [
        "--strip-debug",
        ...removableSections.map((section) => `--remove-section=${section}`),
        soPath,
      ],
      {
        stdio: "pipe",
        timeout: 30_000,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw ApiError.buildFailed(`Failed to normalize Solana ELF: ${message}`);
  }
}

function resolveSolanaObjcopy(): string | null {
  const cacheDir = join(homedir(), ".cache", "solana");
  if (!existsSync(cacheDir)) return null;

  const candidates = readdirSync(cacheDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(cacheDir, entry.name, "platform-tools", "llvm", "bin", "llvm-objcopy"))
    .filter((candidate) => existsSync(candidate))
    .toSorted();

  return candidates.at(-1) ?? null;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
