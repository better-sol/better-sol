import {
  getBase64EncodedWireTransaction,
  type Address,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionSigner,
} from "@solana/kit";

type WalletAdapterLike = {
  readonly publicKey: { toBase58(): string };
  readonly signTransaction?: <T>(transaction: T) => Promise<T>;
};

export function walletAdapter(wallet: WalletAdapterLike): TransactionSigner {
  const address = wallet.publicKey.toBase58() as Address;

  return {
    address,
    signTransactions: async (transactions: readonly Transaction[]): Promise<readonly SignatureDictionary[]> => {
      if (wallet.signTransaction === undefined) {
        throw new Error(
          "Wallet does not support signTransaction. " +
          "Install @solana/wallet-adapter-react and ensure the wallet is connected.",
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
            signed = (await wallet.signTransaction!(vTx)) as { readonly signatures: readonly (Uint8Array | null)[] };
          } catch {
            const legacyTx = web3.Transaction.from(wireBytes);
            signed = (await wallet.signTransaction!(legacyTx)) as { signature: Uint8Array | null };
          }

          if (signed === null) {
            throw new Error("Wallet signTransaction returned null");
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
