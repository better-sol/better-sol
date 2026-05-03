import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { ensureParent, fileExists } from "./path";

const AUTH_DIR = join(homedir(), ".better-sol");
const AUTH_PATH = join(AUTH_DIR, "auth.json");

type StoredAuth = {
  readonly apiKey: string;
};

export async function getStoredApiKey(): Promise<string | undefined> {
  if (!fileExists(AUTH_PATH)) return undefined;
  try {
    const raw = await readFile(AUTH_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isStoredAuth(parsed)) return parsed.apiKey;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function storeApiKey(apiKey: string): Promise<void> {
  const data: StoredAuth = { apiKey };
  await ensureParent(AUTH_PATH);
  await writeFile(AUTH_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

function isStoredAuth(value: unknown): value is StoredAuth {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).apiKey === "string";
}
