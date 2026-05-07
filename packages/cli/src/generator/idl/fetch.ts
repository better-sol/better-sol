import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { Idl } from "@coral-xyz/anchor";

export type { Idl };

const CLUSTER_RPC_URLS: Record<string, string> = {
  mainnet: "https://api.mainnet-beta.solana.com",
  mainnet_beta: "https://api.mainnet-beta.solana.com",
  testnet: "https://api.testnet.solana.com",
  devnet: "https://api.devnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

export async function fetchIdlFromChain(programAddress: string, cluster: string = "mainnet"): Promise<Idl | null> {
  const rpcUrl = CLUSTER_RPC_URLS[cluster];
  if (rpcUrl === undefined) throw new Error(`Unknown cluster '${cluster}'. Supported: ${Object.keys(CLUSTER_RPC_URLS).join(", ")}`);

  const connection = new Connection(rpcUrl);
  const wallet = {
    publicKey: PublicKey.unique(),
    signTransaction: async () => { throw new Error("Read-only provider"); },
    signAllTransactions: async () => { throw new Error("Read-only provider"); },
  };
  const provider = new AnchorProvider(connection, wallet, {});
  return Program.fetchIdl(new PublicKey(programAddress), provider);
}

export async function fetchIdlFromFile(filePath: string): Promise<Idl> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;

  if (typeof parsed !== "object" || parsed === null || !("instructions" in parsed)) {
    throw new Error("The file does not appear to be a valid Anchor IDL. Expected an object with an 'instructions' array.");
  }

  return parsed as Idl;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function isSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false;
  for (const ch of value) {
    if (!BASE58.includes(ch)) return false;
  }
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}
