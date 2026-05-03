import type { Address, TransactionSigner } from "@solana/kit";
import { createSignTransactions } from "./sign-utils";

type ReownProvider = {
  readonly signTransaction?: <T>(transaction: T) => Promise<T>;
};

type ReownWalletLike = {
  readonly address: string;
  readonly walletProvider: ReownProvider;
};

export function reownWallet(wallet: ReownWalletLike): TransactionSigner {
  const address = wallet.address as Address;
  const signTransaction = wallet.walletProvider.signTransaction;
  if (signTransaction === undefined) {
    throw new Error(
      "Reown provider does not support signTransaction. " +
      "Ensure useAppKitProvider('solana') returns a connected provider.",
    );
  }
  return {
    address,
    signTransactions: createSignTransactions(address, signTransaction),
  };
}
