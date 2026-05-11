import { intro, outro, log, spinner } from "@clack/prompts";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, basename, resolve, relative } from "node:path";
import { cwdPath } from "#lib/fs";
import type { GenerateIdlOptions } from "#lib/types";
import { generateIdlProgram, fetchIdlFromChain, fetchIdlFromFile, isSolanaAddress } from "#generator/idl";
import type { Idl } from "#generator/idl";
import { toCamel } from "#lib/naming";
import { writeJson } from "../shared";

export async function generateIdl(input: string, options: GenerateIdlOptions): Promise<void> {
  if (options.json !== true) intro("better-sol generate idl");

  const s = options.json === true ? undefined : spinner();
  let idl: Idl;
  let sourceLabel: string;

  if (isSolanaAddress(input)) {
    const cluster = options.cluster ?? "mainnet";
    s?.start(`Fetching IDL for ${input} from ${cluster}`);
    const fetched = await fetchIdlFromChain(input, cluster);
    if (fetched === null) {
      s?.stop("IDL not found");
      throw new Error(`No on-chain IDL found for program ${input} on ${cluster}. The program may not have an Anchor IDL account, or may be deployed on a different cluster.`);
    }
    idl = fetched;
    sourceLabel = `on-chain:${input}`;
    s?.stop("IDL fetched");
  } else {
    s?.start("Reading IDL file");
    const idlPath = cwdPath(input);
    idl = await fetchIdlFromFile(idlPath);
    sourceLabel = basename(idlPath);
    s?.stop("IDL loaded");
  }

  const programName = toCamel(options.name ?? idl.metadata.name);
  const outPath = cwdPath(options.out ?? `generated/${programName}.ts`);

  s?.message("Generating program definition");
  const code = generateIdlProgram(idl, sourceLabel);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, code, "utf-8");

  s?.stop("Generated");

  const importPath = removeExt(relative(process.cwd(), outPath));

  if (options.json === true) {
    writeJson({
      ok: true,
      command: "generate idl",
      programName,
      source: sourceLabel,
      out: resolve(outPath),
      importPath: `./${importPath}`,
      next: `import { ${programName} } from "./${importPath}"`,
    });
    return;
  }

  log.info(`Wrote ${resolve(outPath)}`);
  log.step(`Import it in your app:\n\n  import { ${programName} } from "./${importPath}"\n\nThen register it with the client:\n\n  const sol = await betterSol({ programs: { ${programName} } })`);

  outro("Done");
}

function removeExt(path: string): string {
  return path.replace(/\.ts$/, "");
}
