import { opendir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { IrProgram } from "#ir/types";
import { parseProgramsFromFile } from "./ast";

function globToRegex(pattern: string): RegExp {
  const parts = pattern.split("/");
  const regexParts = parts.map((part) => {
    if (part === "**") return ".*";
    return part
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]");
  });
  return new RegExp(`^${regexParts.join("/")}$`);
}

async function findFiles(pattern: string): Promise<string[]> {
  const regex = globToRegex(pattern);
  const results: string[] = [];
  const root = resolve(process.cwd());

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await opendir(currentDir);
    } catch {
      return;
    }
    for await (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
      } else if (entry.isFile()) {
        const relPath = relative(root, absPath);
        if (regex.test(relPath) && !relPath.includes("node_modules") && !relPath.includes("dist")) {
          results.push(absPath);
        }
      }
    }
  }

  // Extract the base directory from the pattern (everything before the first glob character)
  const firstGlobChar = pattern.search(/[*?{]/);
  const baseDir = firstGlobChar < 0 ? dirname(pattern) : pattern.slice(0, pattern.lastIndexOf("/", firstGlobChar) + 1) || ".";
  const rootDir = resolve(root, baseDir);
  await walk(rootDir);
  return results;
}

export async function discoverPrograms(pattern: string): Promise<readonly IrProgram[]> {
  const files = await findFiles(pattern);

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
