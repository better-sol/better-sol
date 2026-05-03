import {
  getBase64EncodedWireTransaction,
  type Address,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionSigner,
} from "@solana/kit";

type PrivySignTransaction = (args: { readonly transaction: Uint8Array; readonly wallet: unknown }) => Promise<{ readonly signature: Uint8Array }>;
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
          const { signature } = await wallet.signTransaction({
            transaction: wireBytes,
            wallet: wallet.wallet,
          });
          return { [address]: signature as unknown as SignatureBytes } as SignatureDictionary;
        }),
      );
    },
  };
}
