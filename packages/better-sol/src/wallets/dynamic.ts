import {
  getBase64EncodedWireTransaction,
  type Address,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionSigner,
} from "@solana/kit";

type DynamicSigner = {
  readonly signTransaction?: (transaction: unknown) => Promise<unknown>;
};
type DynamicWallet = {
  readonly address: string;
  getSigner(): Promise<DynamicSigner>;
};

export function dynamicWallet(wallet: DynamicWallet): TransactionSigner {
  const address = wallet.address as Address;

  return {
    address,
    signTransactions: async (transactions: readonly Transaction[]): Promise<readonly SignatureDictionary[]> => {
      const signer = await wallet.getSigner();
      if (signer.signTransaction === undefined) {
        throw new Error(
          "Dynamic signer does not support signTransaction. " +
          "Ensure the wallet is a Solana wallet (isSolanaWallet).",
        );
      }
      const { default: web3 } = await import("@solana/web3.js") as unknown as {
        default: {
          VersionedTransaction: { deserialize(buf: Uint8Array): { readonly signatures: readonly (Uint8Array | null)[] } };
          Transaction: { from(buf: Uint8Array): { signature: Uint8Array | null } };
        };
      };

      return Promise.all(
        transactions.map(async (tx) => {
          const wireBytes = Buffer.from(getBase64EncodedWireTransaction(tx), "base64");
          let signed: { readonly signatures: readonly (Uint8Array | null)[] } | { signature: Uint8Array | null } | null = null;

          try {
            const vTx = web3.VersionedTransaction.deserialize(wireBytes);
            signed = (await signer.signTransaction!(vTx)) as { readonly signatures: readonly (Uint8Array | null)[] };
          } catch {
            const legacyTx = web3.Transaction.from(wireBytes);
            signed = (await signer.signTransaction!(legacyTx)) as { signature: Uint8Array | null };
          }

          if (signed === null) {
            throw new Error("Dynamic signTransaction returned null");
          }

          let sigBytes: Uint8Array | null | undefined;
          if ("signatures" in signed && signed.signatures.length > 0) {
            sigBytes = signed.signatures[0] ?? undefined;
          } else if ("signature" in signed) {
            sigBytes = signed.signature ?? undefined;
          }

          const sig: SignatureBytes = (sigBytes !== undefined && sigBytes !== null
            ? new Uint8Array(sigBytes)
            : new Uint8Array(64)) as unknown as SignatureBytes;
          return { [address]: sig } as SignatureDictionary;
        }),
      );
    },
  };
}
