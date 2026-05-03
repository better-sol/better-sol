import type { IrProgram } from "../ir/types";

type CompileRequest = {
  readonly name: string;
  readonly program_id: string;
  readonly version: string;
  readonly lib_rs: string;
  readonly cargo_toml: string;
  readonly idl: unknown;
};

type CompileResponse = {
  readonly id: string;
  readonly name: string;
  readonly program_id: string;
  readonly source_hash: string;
  readonly bytecode_hash: string | null;
  readonly bytecode: string | null;
  readonly size_bytes: number | null;
  readonly logs: string;
  readonly idl_url: string;
  readonly artifact_url: string;
  readonly source_url: string;
};

export async function compileProgram(params: {
  readonly compilerUrl: string;
  readonly apiKey: string | undefined;
  readonly program: IrProgram;
  readonly libRs: string;
  readonly cargoToml: string;
  readonly idl: unknown;
}): Promise<CompileResponse> {
  if (!params.program.address) throw new Error(`${params.program.name} is missing address`);

  const request: CompileRequest = {
    name: params.program.name,
    program_id: params.program.address,
    version: "0.1.0",
    lib_rs: params.libRs,
    cargo_toml: params.cargoToml,
    idl: params.idl,
  };

  const baseUrl = params.compilerUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/v1/compile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(params.apiKey === undefined ? {} : { "x-api-key": params.apiKey }),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Compiler API failed (${response.status}): ${message}`);
  }

  return await response.json() as CompileResponse;
}
