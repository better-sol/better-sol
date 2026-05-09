import {
  type Address as KitAddress,
  type TransactionSigner,
  type Signature,
  address as kitAddress,
  generateKeyPairSigner,
  lamports,
} from "@solana/kit";
import { betterSol } from "better-sol";
import type {
  BetterSolClient,
  BetterSolConfig,
  ProgramInputs,
} from "better-sol";
import { LiteSVM } from "litesvm";
import { createRpcFromSvm } from "@solana/kit-plugin-litesvm";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export type BinaryInputs = Record<string, string>;

export type TestContextConfig<TPrograms extends ProgramInputs> = {
  readonly programs: TPrograms;
  readonly binaries?: BinaryInputs;
  readonly skipBinaries?: boolean;
  readonly computeUnits?: { readonly limit: bigint; readonly price: bigint };
  readonly commitment?: "processed" | "confirmed" | "finalized";
};

export type TestSigner = TransactionSigner;

const DEFAULT_FUND_SOL = 100;
const DEFAULT_BINARY_DIR = ".better-sol/output";
const FALLBACK_BINARY_DIR = "generated";

function resolveBinaryPath(programName: string, binaries: BinaryInputs | undefined): string {
  if (binaries?.[programName] !== undefined) return resolve(binaries[programName]);

  const candidates = [
    join(DEFAULT_BINARY_DIR, `${programName}.so`),
    join(FALLBACK_BINARY_DIR, programName, "target", "deploy", `${programName}.so`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate);
  }

  throw new Error(
    `Compiled binary not found for program "${programName}". Searched:\n`
    + candidates.map((p) => `  - ${p}`).join("\n")
    + `\n\nRun \`npx @better-sol/cli@alpha deploy\` first, or provide an explicit path:\n`
    + `  createTestContext({ programs: { ${programName} }, binaries: { ${programName}: "./path/to/${programName}.so" } })`,
  );
}

function fundAddress(svm: LiteSVM, addressValue: KitAddress, sol: number): void {
  svm.airdrop(addressValue, lamports(BigInt(sol * 1_000_000_000)));
}

export type TestContext<TPrograms extends ProgramInputs> = BetterSolClient<TPrograms, true> & {
  readonly svm: LiteSVM;
  newSigner(fundSol?: number): Promise<TestSigner>;
  as(signer: TransactionSigner): Promise<TestContext<TPrograms>>;
  warp(relativeSeconds: number): void;
  setClock(unixTimestamp: bigint): void;
  setBalance(address: KitAddress | string, sol: number): void;
  createMint(decimals: number): Promise<{
    readonly mint: KitAddress;
    readonly mintSigner: TransactionSigner;
  }>;
  mintTokens(params: {
    readonly mint: KitAddress | string;
    readonly to: KitAddress | string;
    readonly amount: bigint;
    readonly decimals?: number;
  }): Promise<Signature>;
  profile<T>(
    fn: () => Promise<T>,
  ): Promise<{
    readonly result: T;
    readonly computeUnits: bigint;
    readonly logs: readonly string[];
  }>;
};

export async function createTestContext<const TPrograms extends ProgramInputs>(
  config: TestContextConfig<TPrograms>,
): Promise<TestContext<TPrograms>> {
  const svm = new LiteSVM()
    .withBuiltins()
    .withPrecompiles()
    .withDefaultPrograms()
    .withSysvars()
    .withBlockhashCheck(false)
    .withSigverify(false);

  const rpc = createRpcFromSvm(svm);
  const programs = config.programs ?? {} as TPrograms;

  if (!config.skipBinaries) {
    for (const [, programDef] of Object.entries(programs)) {
      const def = programDef as { readonly name: string; readonly address: string };
      const binaryPath = resolveBinaryPath(def.name, config.binaries);
      const buffer = readFileSync(binaryPath);
      svm.addProgram(kitAddress(def.address), new Uint8Array(buffer));
    }
  }

  const payer = await generateKeyPairSigner();
  fundAddress(svm, payer.address, DEFAULT_FUND_SOL);

  const client = await betterSol({
    rpc: rpc as unknown as BetterSolConfig<TPrograms>["rpc"],
    payer,
    programs,
    commitment: config.commitment ?? "processed",
    computeUnits: config.computeUnits,
  } as BetterSolConfig<TPrograms> & { readonly payer: TransactionSigner });

  const typedClient = client as BetterSolClient<TPrograms, true>;

  function attachTestUtilities(
    baseClient: BetterSolClient<TPrograms, true>,
  ): TestContext<TPrograms> {
    const ctx = baseClient as unknown as TestContext<TPrograms>;

    Object.defineProperty(ctx, "svm", { value: svm, writable: false, enumerable: true });

    ctx.newSigner = async (fundSol: number = DEFAULT_FUND_SOL): Promise<TestSigner> => {
      const signer = await generateKeyPairSigner();
      fundAddress(svm, signer.address, fundSol);
      return signer;
    };

    ctx.as = async (signer: TransactionSigner): Promise<TestContext<TPrograms>> => {
      const scopedClient = await baseClient.withSigner(signer);
      return attachTestUtilities(scopedClient as BetterSolClient<TPrograms, true>);
    };

    ctx.warp = (relativeSeconds: number): void => {
      const clock = svm.getClock();
      const slotsPerSecond = 2;
      svm.warpToSlot(clock.slot + BigInt(relativeSeconds * slotsPerSecond));
    };

    ctx.setClock = (unixTimestamp: bigint): void => {
      const clock = svm.getClock();
      clock.unixTimestamp = unixTimestamp;
      svm.setClock(clock);
    };

    ctx.setBalance = (addressValue: KitAddress | string, sol: number): void => {
      const addr = typeof addressValue === "string" ? kitAddress(addressValue) : addressValue;
      const existing = svm.getAccount(addr);
      if (existing.exists) {
        svm.setAccount({ ...existing, lamports: lamports(BigInt(sol * 1_000_000_000)) });
      }
    };

    ctx.createMint = async (decimals: number) => {
      const mintSigner = await generateKeyPairSigner();
      fundAddress(svm, mintSigner.address, 1);
      const result = await baseClient.token.createMint({
        decimals,
        authority: mintSigner.address,
      });
      return { mint: result.mint, mintSigner };
    };

    ctx.mintTokens = async (params: {
      readonly mint: KitAddress | string;
      readonly to: KitAddress | string;
      readonly amount: bigint;
      readonly decimals?: number;
    }) => {
      const mintAddr = typeof params.mint === "string" ? kitAddress(params.mint) : params.mint;
      const toAddr = typeof params.to === "string" ? kitAddress(params.to) : params.to;
      return await baseClient.token.mintTo({
        mint: mintAddr,
        to: toAddr,
        amount: params.amount,
        decimals: params.decimals,
      });
    };

    ctx.profile = async <T>(fn: () => Promise<T>) => {
      const result = await fn();
      return {
        result,
        computeUnits: 0n,
        logs: [],
      };
    };

    return ctx;
  }

  return attachTestUtilities(typedClient);
}
