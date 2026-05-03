import { describe, expect, test } from "bun:test";

describe("wallet adapter round-trip", () => {
  test("walletAdapter constructs a callable TransactionSigner", async () => {
    const { walletAdapter } = await import("../src/wallets/wallet-adapter");
    const mockWallet = {
      publicKey: { toBase58: () => "11111111111111111111111111111111" },
      signTransaction: async <T>(tx: T): Promise<T> => tx,
    };
    const signer = walletAdapter(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof (signer as Record<string, unknown>).signTransactions).toBe("function");
  });

  test("reownWallet constructs a callable TransactionSigner", async () => {
    const { reownWallet } = await import("../src/wallets/reown");
    const mockWallet = {
      address: "11111111111111111111111111111111",
      walletProvider: {
        signTransaction: async <T>(tx: T): Promise<T> => tx,
      },
    };
    const signer = reownWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof (signer as Record<string, unknown>).signTransactions).toBe("function");
  });

  test("privyWallet constructs a callable TransactionSigner", async () => {
    const { privyWallet } = await import("../src/wallets/privy");
    const mockWallet = {
      wallet: { address: "11111111111111111111111111111111" },
      signTransaction: async (_args: { transaction: Uint8Array; wallet: unknown }) => ({ signedTransaction: new Uint8Array(64) }),
    };
    const signer = privyWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof (signer as Record<string, unknown>).signTransactions).toBe("function");
  });

  test("dynamicWallet constructs a callable TransactionSigner", async () => {
    const { dynamicWallet } = await import("../src/wallets/dynamic");
    const mockWallet = {
      address: "11111111111111111111111111111111",
      getSigner: async () => ({ signTransaction: async <T>(tx: T): Promise<T> => tx }),
    };
    const signer = dynamicWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof (signer as Record<string, unknown>).signTransactions).toBe("function");
  });

  test("reownWallet throws when signTransaction is missing", async () => {
    const { reownWallet } = await import("../src/wallets/reown");
    const mockWallet = {
      address: "11111111111111111111111111111111",
      walletProvider: {},
    };
    expect(() => reownWallet(mockWallet)).toThrow("signTransaction");
  });

  test("walletAdapter throws when signTransaction is missing", async () => {
    const { walletAdapter } = await import("../src/wallets/wallet-adapter");
    const mockWallet = {
      publicKey: { toBase58: () => "11111111111111111111111111111111" },
    };
    expect(() => walletAdapter(mockWallet)).toThrow("signTransaction");
  });
});
