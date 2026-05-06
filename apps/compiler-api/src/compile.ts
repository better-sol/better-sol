import { mkdir, rm } from "node:fs/promises";
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
    await Bun.write(`${tmpDir}/Cargo.toml`, cargoToml);
    await Bun.write(`${tmpDir}/src/lib.rs`, libRs);

    const proc = Bun.spawn(
      ["cargo", "build-sbf", "--manifest-path", `${tmpDir}/Cargo.toml`],
      {
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

    const soPath = await findSoFile(`${tmpDir}/target/deploy`);
    if (soPath === null) {
      return {
        bytecode: null,
        logs: `${logs.trim()}\nNo .so file found in target/deploy`,
      };
    }

    const bytes = await Bun.file(soPath).bytes();
    const bytecode = Buffer.from(bytes).toString("base64");

    return { bytecode, logs: logs.trim() };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function findSoFile(deployDir: string): Promise<string | null> {
  const dir = Bun.file(deployDir);
  if (!(await dir.exists())) return null;

  const glob = new Bun.Glob("*.so");
  for await (const match of glob.scan({ cwd: deployDir, absolute: true })) {
    return match;
  }

  return null;
}
