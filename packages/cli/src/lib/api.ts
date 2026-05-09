import type { IrProgram } from "#ir";

const DEFAULT_API_URL = "https://better-sol.fun";

type CompileErrorResponse = {
  readonly error: string;
  readonly retryAfterSeconds?: number;
};

function getApiUrl(): string {
  return process.env.BETTER_SOL_API_URL ?? DEFAULT_API_URL;
}

export type CompileResponse = {
  readonly id?: string;
  readonly status: "success" | "failed";
  readonly compileTimeMs: number;
  readonly bytecode: string | null;
  readonly logs?: string;
};

export async function compileProgram(params: {
  readonly apiKey?: string;
  readonly program: IrProgram;
  readonly libRs: string;
  readonly cargoToml: string;
  readonly idl: unknown;
}): Promise<CompileResponse> {
  if (!params.program.address)
    throw new Error(`${params.program.name} is missing address`);

  const url = getApiUrl();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (params.apiKey) headers["x-api-key"] = params.apiKey;

  const response = await fetch(`${url}/api/compile`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: params.program.name,
      programId: params.program.address,
      version: "0.1.0",
      libRs: params.libRs,
      cargoToml: params.cargoToml,
      idl: params.idl,
    }),
  });

  if (!response.ok) {
    const error = await readJson<CompileErrorResponse>(response);
    if (response.status === 429 && error.retryAfterSeconds !== undefined) {
      throw new Error(`Rate limit exceeded. Try again in ${formatDuration(error.retryAfterSeconds)}.`);
    }
    throw new Error(`Compile failed (${response.status}): ${error.error}`);
  }

  return readJson<CompileResponse>(response);
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}
