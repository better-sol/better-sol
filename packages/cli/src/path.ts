import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export function cwdPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}
