import {
  address as kitAddress,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Instruction,
  type TransactionSigner,
  type Signature,
  nonDivisibleSequentialInstructionPlan,
  flattenInstructionPlan,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { anchorDiscriminator, encodeInstruction } from "../coder";
import {
  type AccountInputs,
  type ArgsSchema,
  type AccountDefinition,
  type FieldSchema,
  type InstructionDefinition,
} from "../program";
import type {
  AnyProgram,
  BetterSolClient,
  BetterSolConfig,
  ProgramInputs,
  KitRpc,
  KitRpcSubscriptions,
  AddressInput,
  InstructionSigningMode,
  SimulateResult,
  PrepareResult,
} from "./types";
import { CLUSTER_URLS, CLUSTER_WS_URLS, TOKEN_2022_PROGRAM_ADDRESS } from "./types";
import { resolveSigner, requireSigner } from "./signer";
import { buildAndSignTransaction, sendAndConfirm, runSimulation, buildAccountMetas, toSnake, withComputeBudget } from "./transaction";
import { BoundAccountImpl } from "./bound-account";
import { buildTokenClient } from "./token-client";

export { secretKey, keypairFile } from "./signer";

export async function betterSol<const TPrograms extends ProgramInputs = Record<string, never>>(
  config: BetterSolConfig<TPrograms> & { readonly payer: import("./types").SignerInput },
): Promise<BetterSolClient<TPrograms, true>>;
export async function betterSol<const TPrograms extends ProgramInputs = Record<string, never>>(
  config: BetterSolConfig<TPrograms>,
): Promise<BetterSolClient<TPrograms, false>>;
export async function betterSol<const TPrograms extends ProgramInputs = Record<string, never>>(
  config: BetterSolConfig<TPrograms>,
): Promise<BetterSolClient<TPrograms, boolean>> {
  const cluster = config.cluster ?? "devnet";
  const rpcUrl = config.rpcUrl ?? CLUSTER_URLS[cluster];
  const rpcSubscriptionsUrl = config.rpcSubscriptionsUrl ?? (config.rpcUrl === undefined ? CLUSTER_WS_URLS[cluster] : undefined);
  if (rpcSubscriptionsUrl === undefined) throw new Error("Custom RPC URL requires explicit rpcSubscriptionsUrl in betterSol config.");
  const commitment = config.commitment ?? "confirmed";
  const computeUnits = config.computeUnits;
  const rpc = createSolanaRpc(rpcUrl);
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl);
  const signer = config.payer === undefined ? undefined : await resolveSigner(config.payer);
  const programs = config.programs ?? {} as TPrograms;
  return buildClient({ programs, rpc, rpcSubscriptions, signer, commitment, computeUnits });
}

function buildClient<const TPrograms extends ProgramInputs, THasSigner extends boolean = boolean>(params: {
  readonly programs: TPrograms;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly signer: TransactionSigner | undefined;
  readonly commitment: "processed" | "confirmed" | "finalized";
  readonly computeUnits?: import("./types").ComputeUnitConfig;
}): BetterSolClient<TPrograms, THasSigner> {
  const client: Record<string, unknown> = {
    payer: params.signer?.address ?? null,
    rpc: params.rpc,
    rpcSubscriptions: params.rpcSubscriptions,
    token: buildTokenClient(params.rpc, params.signer, params.commitment, TOKEN_PROGRAM_ADDRESS),
    token2022: buildTokenClient(params.rpc, params.signer, params.commitment, TOKEN_2022_PROGRAM_ADDRESS),
    withSigner: async (signerInput: import("./types").SignerInput): Promise<BetterSolClient<TPrograms, true>> => {
      const nextSigner = await resolveSigner(signerInput);
      return buildClient<TPrograms, true>({ ...params, signer: nextSigner });
    },
    getBalance: async (addressValue: AddressInput): Promise<bigint> => {
      const { value } = await params.rpc.getBalance(kitAddress(addressValue), { commitment: params.commitment }).send();
      return value;
    },
    transfer: async (transferParams: { readonly to: AddressInput; readonly amount: bigint; readonly from?: AddressInput }): Promise<Signature> => {
      const signer = requireSigner(params.signer);
      const sourceAddress = transferParams.from ?? signer.address;
      if (kitAddress(sourceAddress) !== signer.address) throw new Error("Source must match the active signer. Use sol.withSigner() for a different signer.");
      const ix = getTransferSolInstruction({ source: signer, destination: kitAddress(transferParams.to), amount: transferParams.amount });
      const signedTx = await buildAndSignTransaction([ix], params.rpc, signer, params.commitment);
      return await sendAndConfirm(signedTx, params.rpc);
    },
    send: async (instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature> => {
      const signer = requireSigner(params.signer);
      const resolved = await Promise.all(instructions);
      const withBudget = withComputeBudget(resolved, params.computeUnits);
      const signedTx = await buildAndSignTransaction(withBudget, params.rpc, signer, params.commitment);
      return await sendAndConfirm(signedTx, params.rpc);
    },
    batch: async (instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature> => {
      const signer = requireSigner(params.signer);
      const resolved = await Promise.all(instructions);
      const plan = nonDivisibleSequentialInstructionPlan(resolved);
      const signedTx = await buildAndSignTransaction(
        flattenInstructionPlan(plan).flatMap((leaf) => leaf.kind === "single" ? [leaf.instruction] : []),
        params.rpc,
        signer,
        params.commitment,
      );
      return await sendAndConfirm(signedTx, params.rpc);
    },
    steps: async (stepFns: readonly ((...prev: unknown[]) => Promise<unknown>)[]): Promise<unknown[]> => {
      const results: unknown[] = [];
      await stepFns.reduce<Promise<void>>(async (previous, fn) => {
        await previous;
        results.push(await fn(...results));
      }, Promise.resolve());
      return results;
    },
    onTransaction: (_callback: (signature: import("@solana/kit").Signature, result: import("@solana/kit").Slot) => void): (() => void) => {
      return () => {};
    },
  };

  for (const [programName, programDef] of Object.entries(params.programs)) {
    client[programName] = buildProgramClient(programDef as AnyProgram, params.rpc, params.signer, params.commitment);
  }

  return client as unknown as BetterSolClient<TPrograms, THasSigner>;
}

function buildProgramClient(
  program: AnyProgram,
  rpc: KitRpc,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
): Record<string, unknown> {
  const result: Record<string, unknown> = { address: kitAddress(program.address) };

  for (const [ixName, ixDef] of Object.entries(program.instructions)) {
    const def = ixDef as InstructionDefinition<AccountInputs, ArgsSchema | undefined>;
    const snakeName = toSnake(ixName);
    const programId = program.address;

    const sendFn = async (inputParams?: Record<string, unknown>): Promise<Signature> => {
      const activeSigner = requireSigner(signer);
      const params = inputParams ?? {};
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed");
      const signedTx = await buildAndSignTransaction([ix], rpc, activeSigner, commitment);
      return await sendAndConfirm(signedTx, rpc);
    };

    const instructionFn = async (inputParams?: Record<string, unknown>): Promise<Instruction> => {
      const params = inputParams ?? {};
      return await buildInstruction(def, params, programId, snakeName, signer, "unsigned");
    };

    const transactionFn = async (inputParams?: Record<string, unknown>): Promise<import("./types").SignedTransaction> => {
      const params = inputParams ?? {};
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed");
      return await buildAndSignTransaction([ix], rpc, activeSigner, commitment);
    };

    const simulateFn = async (inputParams?: Record<string, unknown>): Promise<SimulateResult> => {
      const params = inputParams ?? {};
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed");
      const signedTx = await buildAndSignTransaction([ix], rpc, activeSigner, commitment);
      return await runSimulation(signedTx, rpc, commitment);
    };

    const prepareFn = async (inputParams?: Record<string, unknown>): Promise<PrepareResult> => {
      const params = inputParams ?? {};
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed");
      const pubkeys: Record<string, import("@solana/kit").Address> = {};
      if (ix.accounts !== undefined) for (const meta of ix.accounts) pubkeys[meta.address] = meta.address;
      return { instruction: ix, signers: [activeSigner], pubkeys };
    };

    const planFn = async (inputParams?: Record<string, unknown>): Promise<import("./types").InstructionPlanResult> => {
      const params = inputParams ?? {};
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed");
      return { instruction: ix, plan: { kind: "single", instruction: ix, planType: "instructionPlan" } };
    };

    result[ixName] = Object.assign(sendFn, {
      send: sendFn,
      instruction: instructionFn,
      transaction: transactionFn,
      simulate: simulateFn,
      prepare: prepareFn,
      plan: planFn,
    });
  }

  const accountNamespace: Record<string, unknown> = {};
  for (const [accountName, accountDef] of Object.entries(program.accounts)) {
    accountNamespace[accountName] = new BoundAccountImpl(
      accountDef as AccountDefinition<FieldSchema, boolean, readonly string[]>,
      program.address,
      rpc,
      accountName,
      commitment,
    );
  }
  result["accounts"] = accountNamespace;

  return result;
}

async function buildInstruction(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
  programId: string,
  snakeName: string,
  signer: TransactionSigner | undefined,
  mode: InstructionSigningMode,
): Promise<Instruction> {
  const accounts = buildAccountMetas(ixDef, params, signer, mode);
  return buildInstructionData(snakeName, ixDef, params).then((data) => ({ programAddress: kitAddress(programId), accounts, data }));
}

async function buildInstructionData(
  snakeName: string,
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  if (ixDef.args === undefined || Object.keys(ixDef.args).length === 0) return await anchorDiscriminator(snakeName);
  return await encodeInstruction(snakeName, ixDef.args, params);
}
