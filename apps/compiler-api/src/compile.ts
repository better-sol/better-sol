import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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
  readonly cargoToml: string;
  readonly logs: string;
};

export async function compile(input: unknown): Promise<CompileOutput> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw ApiError.invalid(parsed.error.message);

  const { libRs, cargoToml } = parsed.data;
  const started = performance.now();

  const { bytecode, logs } = env.ENABLE_BUILD
    ? await runBuild(libRs, cargoToml)
    : {
        bytecode: null,
        logs:
          "Build execution disabled. Set COMPILER_ENABLE_BUILD=true to run cargo build-sbf.",
      };

  return {
    status: bytecode !== null ? "success" : "failed",
    compileTimeMs: Math.round(performance.now() - started),
    bytecode,
    cargoToml,
    logs,
  };
}

async function runBuild(
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

    const soPath = await findSoFile(`${tmpDir}/target`);
    if (soPath === null) {
      return {
        bytecode: null,
        logs: `${logs.trim()}\nNo .so file found in target/`,
      };
    }

    stripSolanaElf(soPath);

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

[target.sbf-solana-solana]
rustflags = ["-C", "link-arg=--build-id=none"]
`;
}

function stripSolanaElf(soPath: string): void {
  const objcopy = resolveObjcopy();
  if (objcopy === null) return;

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
  } catch {
  }
}

function resolveObjcopy(): string | null {
  const candidates = [
    "llvm-objcopy",
    "rust-objcopy",
    "objcopy",
    ...solanaCacheObjcopyCandidates(),
  ];

  for (const candidate of candidates) {
    if (canRun(candidate)) return candidate;
  }

  return null;
}

function solanaCacheObjcopyCandidates(): readonly string[] {
  const cacheDir = join(homedir(), ".cache", "solana");
  if (!existsSync(cacheDir)) return [];

  const candidates: string[] = [];
  for (const versionEntry of readdirSync(cacheDir, { withFileTypes: true })) {
    if (!versionEntry.isDirectory()) continue;

    const platformToolsDir = join(cacheDir, versionEntry.name, "platform-tools");
    candidates.push(join(platformToolsDir, "llvm", "bin", "llvm-objcopy"));

    const rustlibDir = join(platformToolsDir, "rust", "lib", "rustlib");
    if (!existsSync(rustlibDir)) continue;

    for (const rustlibEntry of readdirSync(rustlibDir, { withFileTypes: true })) {
      if (!rustlibEntry.isDirectory()) continue;
      const binDir = join(rustlibDir, rustlibEntry.name, "bin");
      candidates.push(join(binDir, "llvm-objcopy"));
      candidates.push(join(binDir, "rust-objcopy"));
    }
  }

  return candidates;
}

function canRun(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function findSoFile(targetDir: string): Promise<string | null> {
  try {
    const dir = Bun.file(targetDir);
    const stat = await dir.stat();
    if (stat === undefined || !stat.isDirectory()) return null;
  } catch {
    return null;
  }

  const glob = new Bun.Glob("**/*.so");
  for await (const match of glob.scan({ cwd: targetDir, absolute: true })) {
    return match;
  }

  return null;
}
