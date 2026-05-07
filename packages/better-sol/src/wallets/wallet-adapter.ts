import type { Address, TransactionPartialSigner } from "@solana/kit";
import { createSignTransactions } from "./sign-utils.ts";

type WalletAdapterLike = {
  readonly publicKey: { toBase58(): string };
  readonly signTransaction?: <T>(transaction: T) => Promise<T>;
};

export function walletAdapter(wallet: WalletAdapterLike): TransactionPartialSigner {
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

export { reownWallet } from "./reown.ts";
export { privyWallet } from "./privy.ts";
export { dynamicWallet } from "./dynamic.ts";
