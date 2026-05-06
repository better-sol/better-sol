import type { IrProgram } from "../ir/types";

const DEFAULT_API_URL = "https://better-sol.dev";

export function getApiUrl(): string {
  return process.env.BETTER_SOL_API_URL ?? DEFAULT_API_URL;
}

export type CompileResponse = {
  readonly id: string;
  readonly status: "success" | "failed";
  readonly compileTimeMs: number;
  readonly bytecode: string | null;
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
    const message = await response.text();
    throw new Error(`Compile failed (${response.status}): ${message}`);
  }

  return (await response.json()) as CompileResponse;
}
