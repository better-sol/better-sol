import { Glob } from "bun";
import { readFile } from "node:fs/promises";
import type { IrProgram } from "../ir/types";
import { parseProgramsFromFile } from "./ast";

export async function discoverPrograms(pattern: string): Promise<readonly IrProgram[]> {
  const glob = new Glob(pattern);
  const files: string[] = [];
  for await (const filePath of glob.scan({ cwd: process.cwd(), absolute: true, onlyFiles: true })) {
    if (!filePath.includes("/node_modules/") && !filePath.includes("/dist/")) files.push(filePath);
  }

  const allPrograms: IrProgram[] = [];
  const sources = await Promise.all(files.toSorted().map(async (filePath) => ({
    filePath,
    source: await readFile(filePath, "utf8"),
  })));
  for (const { filePath, source } of sources) {
    const programs = parseProgramsFromFile(source, filePath);
    allPrograms.push(...programs);
  }

  return allPrograms;
}
