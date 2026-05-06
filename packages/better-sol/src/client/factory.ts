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
  type TypeToken,
  type TypeKind,
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
import { buildAndSignTransaction, buildAccountMetas, sendAndConfirm, runSimulation, toSnake, withComputeBudget, type NonceConfig } from "./transaction";
import { buildLookupTableIndex, type LookupTableIndex } from "./lookup-tables";
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

  const lookupTableIndex = config.addressLookupTables !== undefined && config.addressLookupTables.length > 0
    ? await buildLookupTableIndex(rpc, config.addressLookupTables)
    : undefined;

  const nonceConfig: NonceConfig | undefined = config.durableNonce !== undefined
    ? { nonceAccountAddress: config.durableNonce.nonceAccountAddress, nonceAuthority: config.durableNonce.nonceAuthority }
    : undefined;

  return buildClient({ programs, rpc, rpcSubscriptions, signer, commitment, computeUnits, nonceConfig, lookupTableIndex });
}

interface ClientParams<TPrograms extends ProgramInputs> {
  readonly programs: TPrograms;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly signer: TransactionSigner | undefined;
  readonly commitment: "processed" | "confirmed" | "finalized";
  readonly computeUnits?: import("./types").ComputeUnitConfig;
  readonly nonceConfig?: NonceConfig;
  readonly lookupTableIndex?: LookupTableIndex;
}

function buildClient<const TPrograms extends ProgramInputs, THasSigner extends boolean = boolean>(
  params: ClientParams<TPrograms>,
): BetterSolClient<TPrograms, THasSigner> {
  const { nonceConfig, lookupTableIndex } = params;
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
      const signedTx = await buildAndSignTransaction([ix], params.rpc, signer, params.commitment, nonceConfig);
      return await sendAndConfirm(signedTx, params.rpc);
    },
    send: async (instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature> => {
      const signer = requireSigner(params.signer);
      const resolved = await Promise.all(instructions);
      const withBudget = withComputeBudget(resolved, params.computeUnits);
      const signedTx = await buildAndSignTransaction(withBudget, params.rpc, signer, params.commitment, nonceConfig);
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
        nonceConfig,
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
    client[programName] = buildProgramClient(programDef as AnyProgram, params.rpc, params.signer, params.commitment, nonceConfig, lookupTableIndex);
  }

  return client as unknown as BetterSolClient<TPrograms, THasSigner>;
}

function buildProgramClient(
  program: AnyProgram,
  rpc: KitRpc,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  nonceConfig: NonceConfig | undefined,
  lookupTableIndex: LookupTableIndex | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = { address: kitAddress(program.address) };

  for (const [ixName, ixDef] of Object.entries(program.instructions)) {
    const def = ixDef as InstructionDefinition<AccountInputs, ArgsSchema | undefined>;
    const snakeName = toSnake(ixName);
    const programId = program.address;

    const sendFn = async (inputParams?: Record<string, unknown>): Promise<Signature> => {
      const activeSigner = requireSigner(signer);
      const params = inputParams ?? {};
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
      const signedTx = await buildAndSignTransaction([ix], rpc, activeSigner, commitment, nonceConfig);
      return await sendAndConfirm(signedTx, rpc);
    };

    const instructionFn = async (inputParams?: Record<string, unknown>): Promise<Instruction> => {
      const params = inputParams ?? {};
      return await buildInstruction(def, params, programId, snakeName, signer, "unsigned", lookupTableIndex);
    };

    const transactionFn = async (inputParams?: Record<string, unknown>): Promise<import("./types").SignedTransaction> => {
      const params = inputParams ?? {};
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
      return await buildAndSignTransaction([ix], rpc, activeSigner, commitment, nonceConfig);
    };

    const simulateFn = async (inputParams?: Record<string, unknown>): Promise<SimulateResult> => {
      const params = inputParams ?? {};
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
      const signedTx = await buildAndSignTransaction([ix], rpc, activeSigner, commitment, nonceConfig);
      return await runSimulation(signedTx, rpc, commitment);
    };

    const prepareFn = async (inputParams?: Record<string, unknown>): Promise<PrepareResult> => {
      const params = inputParams ?? {};
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
      const pubkeys: Record<string, import("@solana/kit").Address> = {};
      if (ix.accounts !== undefined) for (const meta of ix.accounts) pubkeys[meta.address] = meta.address;
      return { instruction: ix, signers: [activeSigner], pubkeys };
    };

    const planFn = async (inputParams?: Record<string, unknown>): Promise<import("./types").InstructionPlanResult> => {
      const params = inputParams ?? {};
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
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
  lookupTableIndex?: LookupTableIndex,
): Promise<Instruction> {
  const accounts = buildAccountMetas(ixDef, params, signer, mode, lookupTableIndex);
  return buildInstructionData(snakeName, ixDef, params).then((data) => ({ programAddress: kitAddress(programId), accounts, data }));
}

async function buildInstructionData(
  snakeName: string,
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  validateArgs(ixDef.args, params, snakeName);
  if (ixDef.args === undefined || Object.keys(ixDef.args).length === 0) return await anchorDiscriminator(snakeName);
  return await encodeInstruction(snakeName, ixDef.args, params);
}

function validateArgs(
  argsSchema: ArgsSchema | undefined,
  params: Record<string, unknown>,
  ixName: string,
): void {
  if (argsSchema === undefined) return;
  for (const [name, token] of Object.entries(argsSchema)) {
    if (!(name in params)) {
      throw new Error(`better-sol: instruction "${ixName}" requires arg "${name}" of type ${describeToken(token)}`);
    }
    validateToken(name, token, params[name], ixName);
  }
}

function validateToken(
  name: string,
  token: TypeToken<unknown, TypeKind>,
  value: unknown,
  ixName: string,
): void {
  const err = (expected: string): never => {
    throw new Error(
      `better-sol: instruction "${ixName}" arg "${name}" expects ${expected}, got ${typeof value === "bigint" ? `${value}n` : typeof value === "string" ? `"${value}"` : value}`,
    );
  };

  switch (token.kind) {
    case "u8": case "u16": case "u32":
    case "i8": case "i16": case "i32":
    case "f32": case "f64":
      if (typeof value !== "number") err(`${token.kind} (number)`);
      break;
    case "u64": case "u128": case "i64": case "i128":
      if (typeof value !== "bigint") err(`${token.kind} (bigint)`);
      break;
    case "bool":
      if (typeof value !== "boolean") err("bool");
      break;
    case "pubkey":
      if (typeof value !== "string") err("pubkey (base58 string)");
      break;
    case "string":
      if (typeof value !== "string") err("string");
      break;
    case "bytes":
      if (!(value instanceof Uint8Array)) err("bytes (Uint8Array)");
      break;
    case "option": {
      if (value === null || value === undefined) return;
      const inner = (token as unknown as { readonly inner: TypeToken<unknown, TypeKind> }).inner;
      return validateToken(name, inner, value, ixName);
    }
    case "vec": case "array": {
      const inner = (token as unknown as { readonly inner: TypeToken<unknown, TypeKind> }).inner;
      if (!Array.isArray(value)) err(`array of ${describeToken({ ...token, inner } as unknown as TypeToken<unknown, TypeKind>)}`);
      for (let i = 0; i < (value as unknown[]).length; i++) {
        validateToken(`${name}[${i}]`, inner, (value as unknown[])[i], ixName);
      }
      break;
    }
  }
}

function describeToken(token: TypeToken<unknown, TypeKind>): string {
  const inner = (token as unknown as { readonly inner?: TypeToken<unknown, TypeKind> }).inner;
  const size = (token as unknown as { readonly size?: number }).size;
  switch (token.kind) {
    case "option": return `${describeToken(inner!)} | null`;
    case "vec": return `${describeToken(inner!)}[]`;
    case "array": return `${describeToken(inner!)}[${size}]`;
    default: return token.kind;
  }
}
