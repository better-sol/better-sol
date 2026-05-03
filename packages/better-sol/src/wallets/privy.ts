import { getBase64EncodedWireTransaction, type Address, type SignatureDictionary, type Transaction, type TransactionSigner } from "@solana/kit";
import { VersionedTransaction } from "@solana/web3.js";

type PrivySignTransaction = (args: { readonly transaction: Uint8Array; readonly wallet: unknown }) => Promise<{ readonly signedTransaction: Uint8Array }>;
type PrivyWallet = { readonly address: string };

type PrivyWalletLike = {
  readonly wallet: PrivyWallet;
  readonly signTransaction: PrivySignTransaction;
};

export function privyWallet(wallet: PrivyWalletLike): TransactionSigner {
  const address = wallet.wallet.address as Address;

  return {
    address,
    signTransactions: async (transactions: readonly Transaction[]): Promise<readonly SignatureDictionary[]> => {
      return Promise.all(
        transactions.map(async (tx) => {
          const wireBytes = Buffer.from(getBase64EncodedWireTransaction(tx), "base64");
          const { signedTransaction } = await wallet.signTransaction({
            transaction: wireBytes,
            wallet: wallet.wallet,
          });
          const signedTx = VersionedTransaction.deserialize(signedTransaction);
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
