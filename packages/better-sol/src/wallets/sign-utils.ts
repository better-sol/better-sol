import type { Address, SignatureDictionary, Transaction } from "@solana/kit";
import { VersionedMessage, VersionedTransaction } from "@solana/web3.js";

type SignTransactionFn = <T>(tx: T) => Promise<T>;

export function createSignTransactions(
  address: Address,
  signTransaction: SignTransactionFn,
): (transactions: readonly Transaction[]) => Promise<readonly SignatureDictionary[]> {
  return async (transactions: readonly Transaction[]): Promise<readonly SignatureDictionary[]> => {
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
  };
}
