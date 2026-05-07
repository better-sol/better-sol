const CLUSTER_URLS: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://127.0.0.1:8899",
};

export function clusterUrl(cluster: string): string {
  const url = CLUSTER_URLS[cluster];
  if (url === undefined) throw new Error(`Unknown cluster '${cluster}'. Supported: ${Object.keys(CLUSTER_URLS).join(", ")}`);
  return url;
}

export async function getBalance(address: string, rpcUrl: string): Promise<bigint> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
  });
  const result = (await response.json()) as { result?: { value?: number | string } };
  if (result.result?.value === undefined) throw new Error("Failed to get balance");
  return BigInt(result.result.value);
}

export async function requestAirdrop(address: string, rpcUrl: string, lamports: bigint): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "requestAirdrop", params: [address, Number(lamports)] }),
  });
  const result = (await response.json()) as { result?: string; error?: { message: string } };
  if (result.error !== undefined) throw new Error(result.error.message);
  if (result.result === undefined) throw new Error("No airdrop signature returned");
  return result.result;
}

export async function confirmSignature(signature: string, rpcUrl: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignatureStatuses", params: [[signature]] }),
    });
    const result = (await response.json()) as { result?: { value?: Array<{ confirmationStatus?: string } | null> } };
    const status = result.result?.value?.[0];
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Transaction confirmation timed out");
}
