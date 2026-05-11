import { spinner } from "@clack/prompts";
import type { IrProgram } from "#ir";
import { discoverPrograms } from "#parser/discover";

export const CLI_COMMAND = "npx @better-sol/cli@alpha";
export const API_KEYS_URL = "https://better-sol.fun/dash";

export function writeJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function discoverProgramsWithSpinner(
  src: string,
  options: { readonly json?: boolean } = {},
): Promise<readonly IrProgram[]> {
  if (options.json === true) {
    const programs = await discoverPrograms(src);
    if (programs.length === 0) throw new Error(`No program() definitions found in ${src}`);
    return programs;
  }

  const s = spinner();
  s.start(`Discovering programs from ${src}`);
  const programs = await discoverPrograms(src);
  if (programs.length === 0) {
    s.stop("No programs found");
    throw new Error(`No program() definitions found in ${src}`);
  }
  s.stop(`Found ${programs.length} program${programs.length === 1 ? "" : "s"}`);
  return programs;
}
