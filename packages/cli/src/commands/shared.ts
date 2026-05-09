import { spinner } from "@clack/prompts";
import type { IrProgram } from "#ir";
import { discoverPrograms } from "#parser/discover";

export const CLI_COMMAND = "npx @better-sol/cli@alpha";
export const API_KEYS_URL = "https://better-sol.fun/dash";

export async function discoverProgramsWithSpinner(
  src: string,
): Promise<readonly IrProgram[]> {
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
