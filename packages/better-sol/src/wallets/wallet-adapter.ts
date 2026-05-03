import type { Address, SignatureDictionary, Transaction, TransactionSigner } from "@solana/kit";
import { VersionedMessage, VersionedTransaction } from "@solana/web3.js";

type WalletAdapterLike = {
  readonly publicKey: { toBase58(): string };
  readonly signTransaction?: <T>(transaction: T) => Promise<T>;
};

export function walletAdapter(wallet: WalletAdapterLike): TransactionSigner {
  const address = wallet.publicKey.toBase58() as Address;
  const signTransaction = wallet.signTransaction;
  if (signTransaction === undefined) {
    throw new Error(
      "Wallet does not support signTransaction. " +
      "Install @solana/wallet-adapter-react and ensure the wallet is connected.",
    );
  }

  return {
    address,
    signTransactions: async (transactions: readonly Transaction[]): Promise<readonly SignatureDictionary[]> => {
      return Promise.all(
        transactions.map(async (tx) => {
          const messageBytes = new Uint8Array(tx.messageBytes);
          const message = VersionedMessage.deserialize(messageBytes);
          const unsignedTx = new VersionedTransaction(message);
          const signedTx = await signTransaction(unsignedTx);
          const firstSig = signedTx.signatures[0];
          const sigBytes = firstSig !== undefined && firstSig !== null
            ? new Uint8Array(firstSig)
            : new Uint8Array(64);
          return { [address]: sigBytes } as SignatureDictionary;
        }),
      );
    },
  };
}
