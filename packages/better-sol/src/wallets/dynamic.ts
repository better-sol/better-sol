import type { Address, TransactionPartialSigner } from "@solana/kit";
import { createSignTransactions } from "./sign-utils";

type DynamicSigner = {
  readonly signTransaction?: <T>(transaction: T) => Promise<T>;
};

type DynamicWallet = {
  readonly address: string;
  getSigner(): Promise<DynamicSigner>;
};

export function dynamicWallet(wallet: DynamicWallet): TransactionPartialSigner {
  const address = wallet.address as Address;

  return {
    address,
    signTransactions: async (transactions) => {
      const signer = await wallet.getSigner();
      const signTransaction = signer.signTransaction;
      if (signTransaction === undefined) {
        throw new Error(
          "Dynamic signer does not support signTransaction. " +
          "Ensure the wallet is a Solana wallet (isSolanaWallet).",
        );
      }
      return createSignTransactions(address, signTransaction)(transactions);
    },
  };
}
