import { betterSol, secretKey, keypairFile } from "better-sol";
import type { TransactionSigner } from "@solana/kit";
import {
  account, p, program, pubkey, u64, bool, type Address,
} from "better-sol/program";

const Counter = account({ count: u64, authority: pubkey, isActive: bool }).derive((seed) => ["counter", seed.authority]);

const counter = program(
  {
    name: "counter",
    address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
    accounts: { Counter },
    errors: { Unauthorized: "Only authority" },
  },
  ix => ({
    initialize: ix({
      accounts: { counter: p.create(Counter), authority: p.signer() },
      args: { initialValue: u64 },
      run: () => {},
    }),
    increment: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: () => {},
    }),
    close: ix({
      accounts: { counter: p.close(Counter, "authority"), authority: p.signer() },
      run: () => {},
    }),
  }),
);

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
});

async function testInstructionTypes() {
  await sol.counter.initialize({
    counter: "11111111111111111111111111111111",
    authority: sol.payer,
    initialValue: 0n,
  });

  await sol.counter.increment({
    counter: "11111111111111111111111111111111",
    authority: sol.payer,
    amount: 10n,
  });

  await sol.counter.close({
    counter: "11111111111111111111111111111111",
    authority: sol.payer,
  });
}

async function testAccountTypes() {
  const addr: Address = await sol.counter.accounts.Counter.derive({ authority: sol.payer });
  const data = await sol.counter.accounts.Counter.fetch(addr);
  if (data) {
    const count: bigint = data.count;
    const auth: string = data.authority;
    const active: boolean = data.isActive;
    console.log(count, auth, active);
  }
}

async function testCoreTypes() {
  const bal: bigint = await sol.getBalance(sol.payer);
  const sig: string = await sol.transfer({ to: "11111111111111111111111111111111", amount: 1000n });
  const ata: string = await sol.token.getATA({ owner: sol.payer, mint: "So11111111111111111111111111111111111111112" });
  const tokenBalance: bigint = await sol.token.getBalance({ owner: sol.payer, mint: "So11111111111111111111111111111111111111112" });
  console.log(bal, sig, ata, tokenBalance);
}

const sol3 = await betterSol({
  payer: secretKey(new Uint8Array(64)),
  programs: { counter },
});

async function testSecretKeySigner() {
  const addr = await sol3.counter.accounts.Counter.derive({ authority: sol3.payer });
  await sol3.counter.increment({ counter: addr, authority: sol3.payer, amount: 1n });
}

const simpleProg = program(
  { name: "simple", address: "11111111111111111111111111111111" },
  ix => ({
    ping: ix({
      accounts: { authority: p.signer() },
      run: () => {},
    }),
  }),
);

const sol2 = await betterSol({
  cluster: "devnet",
  programs: { simple: simpleProg },
});

async function testSimpleProgram() {
  await sol2.simple.ping({ authority: sol2.payer });
}

async function testScopedSigner(signer: TransactionSigner) {
  const userSol = await sol.withSigner(signer);
  await userSol.counter.increment({ counter: "11111111111111111111111111111111", authority: userSol.payer, amount: 1n });
}

async function testNegativeTypes() {
  // @ts-expect-error — missing required account 'counter'
  sol.counter.increment({ authority: sol.payer, amount: 10n });

  // @ts-expect-error — missing required arg 'amount'
  sol.counter.increment({ counter: "11111111111111111111111111111111", authority: sol.payer });

  // @ts-expect-error — initialValue should be bigint, not number
  sol.counter.initialize({ counter: "11111111111111111111111111111111", authority: sol.payer, initialValue: 42 });

  // @ts-expect-error — derive requires 'authority', not 'random'
  sol.counter.accounts.Counter.derive({ random: "x" });

  // @ts-expect-error — non-existent instruction
  sol.counter.nonExistent({});

  // @ts-expect-error — non-existent program
  sol.nonExistent;
}

void testInstructionTypes;
void testAccountTypes;
void testCoreTypes;
void testSecretKeySigner;
void testSimpleProgram;
void testScopedSigner;
void testNegativeTypes;
