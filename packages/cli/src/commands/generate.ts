import { intro, outro, spinner } from "@clack/prompts";
import { loadConfig } from "../config";
import { cwdPath } from "../path";
import type { GenerateDbOptions } from "../types";
import { discoverPrograms } from "../parser/discover";
import { isDbDialect, writeDrizzleSchema } from "../generator/db";

export async function generateDb(options: GenerateDbOptions): Promise<void> {
  intro("better-sol generate db");

  const dialect = options.dialect ?? "postgres";
  if (!isDbDialect(dialect)) throw new Error(`Unsupported dialect '${dialect}'. Expected postgres, mysql, or sqlite.`);

  const config = await loadConfig();
  const src = options.src ?? config.programs;
  const out = cwdPath(options.out ?? "src/db/better-sol.ts");

  const s = spinner();
  s.start(`Discovering programs from ${src}`);
  const programs = await discoverPrograms(src);
  if (programs.length === 0) {
    s.stop("No programs found");
    throw new Error(`No program() definitions found in ${src}`);
  }

  s.message(`Generating Drizzle schema for ${programs.length} program${programs.length === 1 ? "" : "s"}`);
  await writeDrizzleSchema(out, programs, dialect);
  s.stop("Schema generated");

  outro(`Wrote ${out}`);
}
