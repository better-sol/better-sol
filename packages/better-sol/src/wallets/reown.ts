import type { Address, SignatureDictionary, Transaction, TransactionSigner } from "@solana/kit";
import { VersionedMessage, VersionedTransaction } from "@solana/web3.js";

type ReownProvider = {
  readonly signTransaction?: <T>(transaction: T) => Promise<T>;
};

type ReownWalletLike = {
  readonly address: string;
  readonly walletProvider: ReownProvider;
};

export function reownWallet(wallet: ReownWalletLike): TransactionSigner {
  const address = wallet.address as Address;
  const provider = wallet.walletProvider;
  const signTransaction = provider.signTransaction;
  if (signTransaction === undefined) {
    throw new Error(
      "Reown provider does not support signTransaction. " +
      "Ensure useAppKitProvider('solana') returns a connected provider.",
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
