import { generateKeyPairSigner } from "@solana/kit";
import { readFile, writeFile } from "node:fs/promises";
import { ensureParent, fileExists } from "./path";

type ProgramKeypair = { readonly publicKey: string; readonly secretKey: readonly number[] };

export async function createProgramKeypair(path: string, force: boolean): Promise<ProgramKeypair> {
  if (fileExists(path) && !force) return readProgramKeypair(path);

  const signer = await generateKeyPairSigner(true);
  const secretKey = await exportSecretKey(signer.keyPair);
  const data = {
    publicKey: signer.address,
    secretKey,
  };
  await ensureParent(path);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

async function readProgramKeypair(path: string): Promise<ProgramKeypair> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  validateKeypairShape(parsed);
  return parsed;
}

function validateKeypairShape(value: unknown): asserts value is ProgramKeypair {
  if (typeof value !== "object" || value === null) throw new Error("Invalid keypair file");
  const record = value as Record<string, unknown>;
  if (typeof record.publicKey !== "string" || !Array.isArray(record.secretKey) || !record.secretKey.every((item) => typeof item === "number")) {
    throw new Error("Invalid keypair file");
  }
}

async function exportSecretKey(keyPair: CryptoKeyPair): Promise<readonly number[]> {
  const [privateKeyPkcs8, publicKeyRaw] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
    crypto.subtle.exportKey("raw", keyPair.publicKey),
  ]);
  const privateKeyBytes = new Uint8Array(privateKeyPkcs8).slice(16);
  if (privateKeyBytes.byteLength !== 32) throw new Error("Invalid generated private key length");
  const publicKeyBytes = new Uint8Array(publicKeyRaw);
  if (publicKeyBytes.byteLength !== 32) throw new Error("Invalid generated public key length");
  const bytes = new Uint8Array(64);
  bytes.set(privateKeyBytes, 0);
  bytes.set(publicKeyBytes, 32);
  return [...bytes];
}
