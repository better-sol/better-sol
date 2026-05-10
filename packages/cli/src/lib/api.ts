import type { IrProgram } from "#ir";

const DEFAULT_API_URL = "https://better-sol.fun";
const CLI_COMMAND = "npx @better-sol/cli@alpha";
const API_KEYS_URL = "https://better-sol.fun/dash";

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
  readonly bytecodeSha256: string | null;
  readonly sourceSha256: string;
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
    if (response.status === 429) {
      throw new Error(formatRateLimitError(error, params.apiKey !== undefined));
    }
    if (response.status === 401) {
      throw new Error(`${error.error}. Get an API key at ${API_KEYS_URL}, then run \`${CLI_COMMAND} login <api-key>\`.`);
    }
    throw new Error(`Compile failed (${response.status}): ${error.error}`);
  }

  return readJson<CompileResponse>(response);
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

function formatRateLimitError(error: CompileErrorResponse, hasApiKey: boolean): string {
  const retry = error.retryAfterSeconds !== undefined
    ? ` Try again in ${formatDuration(error.retryAfterSeconds)}.`
    : " Try again later.";
  const account = hasApiKey
    ? " Your API key has reached the experimental compiler limit of 100 compiles per hour."
    : ` You are using the anonymous experimental compiler limit of 20 compiles per hour. Get an API key at ${API_KEYS_URL}, then run \`${CLI_COMMAND} login <api-key>\` for 100 compiles per hour.`;
  return `Rate limit exceeded.${retry}${account}`;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}
