import { intro, outro, log, spinner } from "@clack/prompts";
import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, basename, resolve, relative, join, extname, sep } from "node:path";
import { cwdPath } from "#lib/fs";
import type { GenerateIdlOptions } from "#lib/types";
import { generateIdlProgram, fetchIdlFromChain, fetchIdlFromFile, isSolanaAddress } from "#generator/idl";
import type { Idl } from "#generator/idl";
import { toCamel } from "#lib/naming";
import { parseModule } from "#parser/parse";
import { getObjectProperty, isCallExpression, isIdentifier, isObjectExpression } from "#parser/node-helpers";
import type { Node, CallExpression } from "oxc-parser";

export async function generateIdl(input: string, options: GenerateIdlOptions): Promise<void> {
  intro("better-sol generate idl");

  const s = spinner();
  let idl: Idl;
  let sourceLabel: string;

  if (isSolanaAddress(input)) {
    const cluster = options.cluster ?? "mainnet";
    s.start(`Fetching IDL for ${input} from ${cluster}`);
    const fetched = await fetchIdlFromChain(input, cluster);
    if (fetched === null) {
      s.stop("IDL not found");
      throw new Error(`No on-chain IDL found for program ${input} on ${cluster}. The program may not have an Anchor IDL account, or may be deployed on a different cluster.`);
    }
    idl = fetched;
    sourceLabel = `on-chain:${input}`;
    s.stop("IDL fetched");
  } else {
    s.start("Reading IDL file");
    const idlPath = cwdPath(input);
    idl = await fetchIdlFromFile(idlPath);
    sourceLabel = basename(idlPath);
    s.stop("IDL loaded");
  }

  const programName = toCamel(options.name ?? getIdlName(idl) ?? "program");
  const outPath = cwdPath(options.out ?? `generated/${programName}.ts`);

  s.message("Generating program definition");
  const code = generateIdlProgram(idl, sourceLabel);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, code, "utf-8");

  s.stop("Generated");

  log.info(`Wrote ${resolve(outPath)}`);

  log.step(await buildImportGuide(outPath, programName));

  outro("Done");
}

type BetterSolUsage = {
  readonly filePath: string;
  readonly hasProgramsObject: boolean;
};

const IGNORED_DIRECTORIES = new Set([
  ".better-sol",
  ".git",
  ".next",
  "dist",
  "build",
  "node_modules",
]);

async function buildImportGuide(outPath: string, programName: string): Promise<string> {
  const usage = await findBetterSolUsage(process.cwd());
  if (usage !== undefined) {
    const appPath = relativePath(process.cwd(), usage.filePath);
    const specifier = moduleSpecifier(dirname(usage.filePath), outPath);
    const registration = usage.hasProgramsObject
      ? `Add it to the existing programs object:\n\n  programs: { ..., ${programName} }`
      : `Register it with the client:\n\n  const sol = await betterSol({ programs: { ${programName} } })`;
    return `Import it in ${appPath}:\n\n  import { ${programName} } from "${specifier}"\n\n${registration}`;
  }

  return `Import it in your app:\n\n  import { ${programName} } from "${moduleSpecifier(process.cwd(), outPath)}"\n\nThen register it with the client:\n\n  const sol = await betterSol({ programs: { ${programName} } })`;
}

async function findBetterSolUsage(root: string): Promise<BetterSolUsage | undefined> {
  const files = await collectTypeScriptFiles(root);
  let fallback: BetterSolUsage | undefined;

  for (const filePath of files) {
    const source = await readFile(filePath, "utf-8");
    const usage = parseBetterSolUsage(source, filePath);
    if (usage === undefined) continue;
    if (usage.hasProgramsObject) return usage;
    fallback ??= usage;
  }

  return fallback;
}

async function collectTypeScriptFiles(root: string): Promise<readonly string[]> {
  const results: string[] = [];
  await collectTypeScriptFilesInto(root, results);
  return results.sort();
}

async function collectTypeScriptFilesInto(directory: string, results: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) await collectTypeScriptFilesInto(fullPath, results);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = extname(entry.name);
    if (extension === ".ts" || extension === ".tsx") results.push(fullPath);
  }
}

function parseBetterSolUsage(source: string, filePath: string): BetterSolUsage | undefined {
  let program: Node;
  try {
    program = parseModule(filePath, source);
  } catch {
    return undefined;
  }

  let hasCall = false;
  let hasProgramsObject = false;

  visitAst(program, (node) => {
    if (!isBetterSolCall(node)) return;
    hasCall = true;
    const firstArg = node.arguments[0];
    if (!isObjectExpression(firstArg)) return;
    const programsValue = getObjectProperty(firstArg, "programs");
    if (isObjectExpression(programsValue)) hasProgramsObject = true;
  });

  return hasCall ? { filePath, hasProgramsObject } : undefined;
}

function isBetterSolCall(node: Node): node is CallExpression {
  return isCallExpression(node) && isIdentifier(node.callee) && node.callee.name === "betterSol";
}

function visitAst(node: unknown, visit: (node: Node) => void): void {
  if (!isAstNode(node)) return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) visitAst(item, visit);
    } else {
      visitAst(value, visit);
    }
  }
}

function isAstNode(value: unknown): value is Node {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === "string";
}

function moduleSpecifier(fromDirectory: string, toFile: string): string {
  const withoutExtension = removeExt(relative(fromDirectory, toFile));
  const normalized = withoutExtension.split(sep).join("/");
  if (normalized.startsWith(".")) return normalized;
  return `./${normalized}`;
}

function relativePath(fromDirectory: string, toFile: string): string {
  const value = relative(fromDirectory, toFile).split(sep).join("/");
  return value.length > 0 ? value : ".";
}

function removeExt(path: string): string {
  return path.replace(/\.tsx?$/, "");
}

function getIdlName(idl: Idl): string | undefined {
  if (typeof idl.metadata?.name === "string") return idl.metadata.name;
  const record = idl as Record<string, unknown>;
  return typeof record.name === "string" ? record.name : undefined;
}
