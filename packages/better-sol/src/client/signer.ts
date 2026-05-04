import { createKeyPairSignerFromBytes, getAddressEncoder, type Address as KitAddress, type TransactionSigner } from "@solana/kit";
import { encodeField } from "../coder";
import { type TypeKind, type TypeToken } from "../program";
import type { SignerInput } from "./types";

export { secretKey, keypairFile } from "./types";

export function requireSigner(signer: TransactionSigner | undefined): TransactionSigner {
  if (signer !== undefined) return signer;
  throw new Error("No signer configured. Pass payer: keypairFile('./keypair.json') or payer: secretKey(bytes) to betterSol(), or call sol.withSigner(walletAdapter(wallet)) in browser flows.");
}

export async function resolveSigner(signer: SignerInput | undefined): Promise<TransactionSigner> {
  if (signer === undefined) throw new Error("No signer configured. Pass keypairFile('./keypair.json'), secretKey(bytes), or a Kit TransactionSigner.");
  if (isTransactionSignerInput(signer)) return signer;
  if (signer.type === "secretKey") return await createKeyPairSignerFromBytes(signer.value, false);
  if (signer.type === "file") return await loadKeypairFile(signer.path);
  signer satisfies never;
  throw new Error("Unknown signer type");
}

function isTransactionSignerInput(value: SignerInput): value is TransactionSigner {
  return "address" in value && ("signTransactions" in value || "modifyAndSignTransactions" in value || "signAndSendTransactions" in value);
}

async function loadKeypairFile(path: string): Promise<TransactionSigner> {
  if (typeof globalThis.process === "undefined") {
    throw new Error("File-based keypairs require Node.js. Use secretKey() or a Kit TransactionSigner in browsers.");
  }
  const fs = await import("node:fs/promises");
  const pathModule = await import("node:path");
  const resolved = pathModule.resolve(path);
  const parsed = JSON.parse(await fs.readFile(resolved, "utf8")) as unknown;
  const bytes = readSecretKeyBytes(parsed);
  return await createKeyPairSignerFromBytes(bytes, false);
}

function readSecretKeyBytes(value: unknown): Uint8Array {
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return new Uint8Array(value);
  if (typeof value === "object" && value !== null && "secretKey" in value) {
    const keyBytes = (value as { readonly secretKey: unknown }).secretKey;
    if (Array.isArray(keyBytes) && keyBytes.every((item) => typeof item === "number")) return new Uint8Array(keyBytes);
  }
  throw new Error("Invalid keypair file");
}

export function seedToBytes(token: TypeToken<unknown, TypeKind> | undefined, value: unknown, kitAddress: (addr: string) => KitAddress): Uint8Array {
  if (token === undefined) {
    if (typeof value === "string") return new Uint8Array(getAddressEncoder().encode(kitAddress(value)));
    if (typeof value === "number" || typeof value === "bigint") return encodeU64Seed(BigInt(value));
    throw new Error(`Cannot encode seed value: ${String(value)}`);
  }
  const kind = token.kind;
  if (kind === "pubkey") return new Uint8Array(getAddressEncoder().encode(kitAddress(String(value))));
  if (["u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128"].includes(kind)) {
    return new Uint8Array(encodeField(token, value));
  }
  throw new Error(`Unsupported PDA seed type: ${kind}`);
}

function encodeU64Seed(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) buf[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  return buf;
}

export async function createGeneratedSigner(): Promise<TransactionSigner> {
  const { generateKeyPairSigner } = await import("@solana/kit");
  return await generateKeyPairSigner();
}
