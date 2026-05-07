import { generateKeyPairSigner } from "@solana/kit";
import { readFile, writeFile } from "node:fs/promises";
import { ensureParent, fileExists } from "./path";

export type KeypairData = { readonly publicKey: string; readonly secretKey: readonly number[] };

export async function createKeypair(path: string, force: boolean): Promise<KeypairData> {
  if (fileExists(path) && !force) return readKeypair(path);

  const signer = await generateKeyPairSigner(true);
  const secretKey = await exportSecretKey(signer.keyPair);
  const data = [...secretKey];
  await ensureParent(path);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  return { publicKey: signer.address, secretKey: data };
}

export async function readKeypair(path: string): Promise<KeypairData> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    if (!parsed.every((item) => typeof item === "number") || parsed.length !== 64) {
      throw new Error(`Invalid keypair file: ${path}`);
    }
    const secretKey = parsed as readonly number[];
    const publicKey = await derivePublicKeyFromBytes(secretKey);
    return { publicKey, secretKey };
  }

  if (typeof parsed === "object" && parsed !== null && "secretKey" in parsed) {
    const record = parsed as { readonly publicKey?: unknown; readonly secretKey?: unknown };
    if (!Array.isArray(record.secretKey) || !record.secretKey.every((item) => typeof item === "number")) {
      throw new Error(`Invalid keypair file: ${path}`);
    }
    const secretKey = record.secretKey as readonly number[];
    const publicKey = typeof record.publicKey === "string"
      ? record.publicKey
      : await derivePublicKeyFromBytes(secretKey);
    return { publicKey, secretKey };
  }

  throw new Error(`Invalid keypair file: ${path}`);
}

export async function derivePublicKeyFromBytes(keypairBytes: readonly number[]): Promise<string> {
  const { getAddressDecoder } = await import("@solana/kit");
  const publicKeyBytes = new Uint8Array(keypairBytes.slice(32));
  return getAddressDecoder().decode(publicKeyBytes);
}

async function exportSecretKey(keyPair: CryptoKeyPair): Promise<Uint8Array> {
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
  return bytes;
}
