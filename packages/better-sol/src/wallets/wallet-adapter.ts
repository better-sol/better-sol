import type { Address, TransactionSigner } from "@solana/kit";
import { createSignTransactions } from "./sign-utils";

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
    signTransactions: createSignTransactions(address, signTransaction),
  };
}
