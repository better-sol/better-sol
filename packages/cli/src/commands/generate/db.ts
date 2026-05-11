import { intro, outro, spinner } from "@clack/prompts";
import { loadConfig } from "#lib/config";
import { cwdPath } from "#lib/fs";
import type { GenerateDbOptions } from "#lib/types";
import { isDbDialect, writeDrizzleSchema } from "#generator/db";
import { discoverProgramsWithSpinner, writeJson } from "../shared";

export async function generateDb(options: GenerateDbOptions): Promise<void> {
  if (options.json !== true) intro("better-sol generate db");

  const dialect = options.dialect ?? "postgres";
  if (!isDbDialect(dialect)) throw new Error(`Unsupported dialect '${dialect}'. Expected postgres, mysql, or sqlite.`);

  const config = await loadConfig();
  const src = options.src ?? config.programs;
  const out = cwdPath(options.out ?? "src/db/better-sol.ts");

  const programs = await discoverProgramsWithSpinner(src, { json: options.json });

  const s = options.json === true ? undefined : spinner();
  s?.message(`Generating ${dialect} schema for ${programs.length} program${programs.length === 1 ? "" : "s"}`);
  await writeDrizzleSchema(out, programs, dialect);
  s?.stop("Schema generated");

  if (options.json === true) {
    writeJson({ ok: true, command: "generate db", dialect, source: src, out, programs: programs.map((program) => ({ name: program.name, address: program.address })) });
    return;
  }

  outro(`Wrote ${out}`);
}
