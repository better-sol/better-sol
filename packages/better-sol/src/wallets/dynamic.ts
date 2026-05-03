import type { Address, SignatureDictionary, Transaction, TransactionSigner } from "@solana/kit";
import { VersionedMessage, VersionedTransaction } from "@solana/web3.js";

type DynamicSigner = {
  readonly signTransaction?: <T>(transaction: T) => Promise<T>;
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
      const signTransaction = signer.signTransaction;
      if (signTransaction === undefined) {
        throw new Error(
          "Dynamic signer does not support signTransaction. " +
          "Ensure the wallet is a Solana wallet (isSolanaWallet).",
        );
      }

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
