import { describe, expect, test } from "bun:test";
import {
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  generateKeyPairSigner,
  pipe,
  type Transaction,
  type TransactionSigner,
  type TransactionWithLifetime,
  type TransactionWithinSizeLimit,
} from "@solana/kit";

function createMockBlockhash(): Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0] {
  return {
    blockhash: "GfKcyMqFuVxTLkSJnVnLhbbpLZ5DPBPxrL3ZzBXyPpJN",
    lastValidBlockHeight: 2_000_000_000n,
  } as Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0];
}

function createMockWallet(
  publicKeyBase58: string,
  onSign?: () => void,
): {
  readonly publicKey: { toBase58(): string };
  readonly signTransaction: <T>(tx: T) => Promise<T>;
} {
  return {
    publicKey: { toBase58: () => publicKeyBase58 },
    signTransaction: async <T>(tx: T): Promise<T> => {
      onSign?.();
      return tx;
    },
  };
}

type FullTransaction = Transaction & TransactionWithinSizeLimit & TransactionWithLifetime;

async function createTestTransaction(feePayer: TransactionSigner): Promise<FullTransaction> {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(createMockBlockhash(), tx),
  );
  return compileTransaction(message) as FullTransaction;
}

describe("wallet adapter signing", () => {
  test("walletAdapter produces TransactionSigner with correct address", async () => {
    const { walletAdapter } = await import("../src/wallets/wallet-adapter");
    const adapterAddress = "Fake11111111111111111111111111111111111111";

    const mockWallet = createMockWallet(adapterAddress);
    const signer = walletAdapter(mockWallet);

    expect(signer.address as unknown).toBe(adapterAddress);
    expect(typeof signer.signTransactions).toBe("function");
  });

  test("walletAdapter invokes signTransaction and returns signature dict", async () => {
    const { walletAdapter } = await import("../src/wallets/wallet-adapter");

    let wasCalled = false;
    const mockWallet = createMockWallet("Fake11111111111111111111111111111111111111", () => {
      wasCalled = true;
    });

    const signer = walletAdapter(mockWallet);
    const feePayer = await generateKeyPairSigner();
    const tx = await createTestTransaction(feePayer);

    const dicts = await signer.signTransactions([tx]);
    expect(wasCalled).toBe(true);
    expect(Array.isArray(dicts)).toBe(true);
    expect(dicts.length).toBe(1);
    const dict = dicts[0]!;
    expect(Object.keys(dict)).toContain("Fake11111111111111111111111111111111111111");
  });

  test("walletAdapter throws without signTransaction", async () => {
    const { walletAdapter } = await import("../src/wallets/wallet-adapter");
    const mockWallet = { publicKey: { toBase58: () => "Fake11111111111111111111111111111111111111" } };
    expect(() => walletAdapter(mockWallet as Parameters<typeof walletAdapter>[0])).toThrow("does not support signTransaction");
  });

  test("reownWallet constructs a TransactionSigner", async () => {
    const { reownWallet } = await import("../src/wallets/reown");
    const mockWallet = {
      address: "Fake11111111111111111111111111111111111111",
      walletProvider: {
        signTransaction: async <T>(tx: T): Promise<T> => tx,
      },
    };
    const signer = reownWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof signer.signTransactions).toBe("function");
  });

  test("reownWallet invokes walletProvider.signTransaction", async () => {
    const { reownWallet } = await import("../src/wallets/reown");

    let wasCalled = false;
    const mockWallet = {
      address: "Fake11111111111111111111111111111111111111",
      walletProvider: {
        signTransaction: async <T>(tx: T): Promise<T> => {
          wasCalled = true;
          return tx;
        },
      },
    };

    const signer = reownWallet(mockWallet);
    const feePayer = await generateKeyPairSigner();
    const tx = await createTestTransaction(feePayer);
    await signer.signTransactions([tx]);
    expect(wasCalled).toBe(true);
  });

  test("reownWallet throws without walletProvider", async () => {
    const { reownWallet } = await import("../src/wallets/reown");
    const mockWallet = { address: "Fake11111111111111111111111111111111111111" };
    expect(() => reownWallet(mockWallet as Parameters<typeof reownWallet>[0])).toThrow();
  });

  test("privyWallet constructs a TransactionSigner", async () => {
    const { privyWallet } = await import("../src/wallets/privy");
    const mockWallet = {
      wallet: { address: "Fake11111111111111111111111111111111111111" },
      signTransaction: async (_args: { readonly transaction: Uint8Array; readonly wallet: unknown }) =>
        ({ signedTransaction: new Uint8Array(100) }),
    };
    const signer = privyWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof signer.signTransactions).toBe("function");
  });

  test("privyWallet invokes signTransaction", async () => {
    const { privyWallet } = await import("../src/wallets/privy");

    let wasCalled = false;
    const mockWallet = {
      wallet: { address: "Fake11111111111111111111111111111111111111" },
      signTransaction: async (_args: { readonly transaction: Uint8Array; readonly wallet: unknown }) => {
        wasCalled = true;
        return { signedTransaction: new Uint8Array(200) };
      },
    };

    const signer = privyWallet(mockWallet);
    const feePayer = await generateKeyPairSigner();
    const tx = await createTestTransaction(feePayer);
    const dicts = await signer.signTransactions([tx]);
    expect(wasCalled).toBe(true);
    expect(Array.isArray(dicts)).toBe(true);
    expect(dicts.length).toBe(1);
  });

  test("dynamicWallet constructs a TransactionSigner", async () => {
    const { dynamicWallet } = await import("../src/wallets/dynamic");
    const mockWallet = {
      address: "Fake11111111111111111111111111111111111111",
      getSigner: async () => ({
        signTransaction: async <T>(tx: T): Promise<T> => tx,
      }),
    };
    const signer = dynamicWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof signer.signTransactions).toBe("function");
  });

  test("dynamicWallet invokes getSigner", async () => {
    const { dynamicWallet } = await import("../src/wallets/dynamic");

    let getSignerCalled = false;
    let signTransactionCalled = false;
    const mockWallet = {
      address: "Fake11111111111111111111111111111111111111",
      getSigner: async () => {
        getSignerCalled = true;
        return {
          signTransaction: async <T>(tx: T): Promise<T> => {
            signTransactionCalled = true;
            return tx;
          },
        };
      },
    };

    const signer = dynamicWallet(mockWallet);
    const feePayer = await generateKeyPairSigner();
    const tx = await createTestTransaction(feePayer);
    await signer.signTransactions([tx]);
    expect(getSignerCalled).toBe(true);
    expect(signTransactionCalled).toBe(true);
  });

  test("signTransactions handles multiple transactions", async () => {
    const { walletAdapter } = await import("../src/wallets/wallet-adapter");

    let callCount = 0;
    const mockWallet = createMockWallet("Fake11111111111111111111111111111111111111", () => {
      callCount++;
    });

    const signer = walletAdapter(mockWallet);
    const feePayer = await generateKeyPairSigner();
    const tx1 = await createTestTransaction(feePayer);
    const tx2 = await createTestTransaction(feePayer);

    const dicts = await signer.signTransactions([tx1, tx2]);
    expect(callCount).toBe(2);
    expect(dicts.length).toBe(2);
    expect(Array.isArray(dicts)).toBe(true);
  });
});
