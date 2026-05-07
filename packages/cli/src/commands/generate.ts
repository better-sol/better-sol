import { intro, outro, spinner } from "@clack/prompts";
import { loadConfig } from "#config";
import { cwdPath } from "#path";
import type { GenerateDbOptions } from "#types";
import { isDbDialect, writeDrizzleSchema } from "#generator/db";
import { discoverProgramsWithSpinner } from "./shared";

export async function generateDb(options: GenerateDbOptions): Promise<void> {
  intro("better-sol generate db");

  const dialect = options.dialect ?? "postgres";
  if (!isDbDialect(dialect)) throw new Error(`Unsupported dialect '${dialect}'. Expected postgres, mysql, or sqlite.`);

  const config = await loadConfig();
  const src = options.src ?? config.programs;
  const out = cwdPath(options.out ?? "src/db/better-sol.ts");

  const programs = await discoverProgramsWithSpinner(src);

  const s = spinner();
  s.message(`Generating ${dialect} Drizzle schema for ${programs.length} program${programs.length === 1 ? "" : "s"}`);
  await writeDrizzleSchema(out, programs, dialect);
  s.stop("Schema generated");

  outro(`Wrote ${out}`);
}
