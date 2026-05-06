import {
  address as kitAddress,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Address as KitAddress,
  type Instruction,
  type TransactionSigner,
  type Signature,
  nonDivisibleSequentialInstructionPlan,
  flattenInstructionPlan,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  anchorDiscriminator,
  encodeInstruction,
} from "../coder";
import {
  type AccountDefinition,
  type FieldSchema,
  type InstructionDefinition,
  type AccountInputs,
  type ArgsSchema,
  type TypeToken,
  type TypeKind,
  hasInnerToken,
  hasInnerAndSizeToken,
  innerOfToken,
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
  SignerInput,
  TokenClient,
  ComputeUnitConfig,
  SignedTransaction,
  SimulateResult,
  PrepareResult,
  InstructionPlanResult,
  StepChain,
} from "./types";
import { CLUSTER_URLS, CLUSTER_WS_URLS, TOKEN_2022_PROGRAM_ADDRESS } from "./types";
import { resolveSigner, requireSigner } from "./signer";
import { buildAndSignTransaction, buildAccountMetas, sendAndConfirm, runSimulation, toSnake, withComputeBudget, createTransactionNotifier, type NonceConfig, type TransactionCallback } from "./transaction";
import { buildLookupTableIndex, type LookupTableIndex } from "./lookup-tables";
import { BoundAccountImpl } from "./bound-account";
import { buildTokenClient } from "./token-client";

export { secretKey, keypairFile } from "./signer";

interface ClientCore<TPrograms extends ProgramInputs, THasSigner extends boolean> {
  readonly payer: THasSigner extends true ? KitAddress : KitAddress | null;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly token: TokenClient;
  readonly token2022: TokenClient;
  withSigner(signer: SignerInput): Promise<BetterSolClient<TPrograms, true>>;
  send(instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature>;
  batch(instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature>;
  steps<const TOutputs extends readonly unknown[]>(steps: StepChain<TOutputs>): Promise<TOutputs>;
  getBalance(address: AddressInput): Promise<bigint>;
  transfer(params: { readonly to: AddressInput; readonly amount: bigint; readonly from?: AddressInput }): Promise<Signature>;
  onTransaction(callback: (signature: Signature, result: bigint) => void): () => void;
}

type ProgramNamespace<TPrograms extends ProgramInputs> = {
  [K in keyof TPrograms]: TPrograms[K] extends AnyProgram ? ProgramClientImpl : never;
};

type BetterSolClientShape<TPrograms extends ProgramInputs, THasSigner extends boolean> = ClientCore<TPrograms, THasSigner> & ProgramNamespace<TPrograms>;

export async function betterSol<const TPrograms extends ProgramInputs = Record<string, never>>(
  config: BetterSolConfig<TPrograms> & { readonly payer: SignerInput },
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

  const notifier = createTransactionNotifier();

  return buildClientShape({ programs, rpc, rpcSubscriptions, signer, commitment, computeUnits, nonceConfig, lookupTableIndex, notifier }) as BetterSolClient<TPrograms, typeof config.payer extends undefined ? false : true>;
}

interface ClientParams<TPrograms extends ProgramInputs> {
  readonly programs: TPrograms;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly signer: TransactionSigner | undefined;
  readonly commitment: "processed" | "confirmed" | "finalized";
  readonly computeUnits?: ComputeUnitConfig;
  readonly nonceConfig?: NonceConfig;
  readonly lookupTableIndex?: LookupTableIndex;
  readonly notifier: ReturnType<typeof createTransactionNotifier>;
}

function buildClientShape<const TPrograms extends ProgramInputs, THasSigner extends boolean = boolean>(
  params: ClientParams<TPrograms>,
): BetterSolClientShape<TPrograms, THasSigner> {
  const { nonceConfig, lookupTableIndex, notifier } = params;
  const payer = (params.signer?.address ?? null) as THasSigner extends true ? KitAddress : KitAddress | null;

  const core: ClientCore<TPrograms, THasSigner> = {
    payer,
    rpc: params.rpc,
    rpcSubscriptions: params.rpcSubscriptions,
    token: buildTokenClient(params.rpc, params.signer, params.commitment, TOKEN_PROGRAM_ADDRESS, nonceConfig, notifier.notify),
    token2022: buildTokenClient(params.rpc, params.signer, params.commitment, TOKEN_2022_PROGRAM_ADDRESS, nonceConfig, notifier.notify),
    withSigner: async (signerInput: SignerInput): Promise<BetterSolClient<TPrograms, true>> => {
      const nextSigner = await resolveSigner(signerInput);
      return buildClientShape<TPrograms, true>({ ...params, signer: nextSigner }) as BetterSolClient<TPrograms, true>;
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
      return await sendAndConfirm(signedTx, params.rpc, notifier.notify);
    },
    send: async (instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature> => {
      const signer = requireSigner(params.signer);
      const resolved = await Promise.all(instructions);
      const withBudget = withComputeBudget(resolved, params.computeUnits);
      const signedTx = await buildAndSignTransaction(withBudget, params.rpc, signer, params.commitment, nonceConfig);
      return await sendAndConfirm(signedTx, params.rpc, notifier.notify);
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
      return await sendAndConfirm(signedTx, params.rpc, notifier.notify);
    },
    steps: async <const TOutputs extends readonly unknown[]>(stepFns: readonly ((...prev: unknown[]) => Promise<unknown>)[]): Promise<TOutputs> => {
      const results: unknown[] = [];
      await stepFns.reduce<Promise<void>>(async (previous, fn) => {
        await previous;
        results.push(await fn(...results));
      }, Promise.resolve());
      return results as unknown as TOutputs;
    },
    onTransaction: (callback: TransactionCallback): (() => void) => {
      return notifier.subscribe(callback);
    },
  };

  const programNamespace = {} as ProgramNamespace<TPrograms>;
  for (const [programName, programDef] of Object.entries(params.programs)) {
    (programNamespace as Record<string, unknown>)[programName] = createProgramClient(programDef as AnyProgram, params.rpc, params.signer, params.commitment, nonceConfig, lookupTableIndex, notifier.notify);
  }

  return { ...core, ...programNamespace } as BetterSolClientShape<TPrograms, THasSigner>;
}

interface ProgramClientImpl {
  readonly address: KitAddress;
  readonly accounts: Record<string, unknown>;
}

function createProgramClient(
  program: AnyProgram,
  rpc: KitRpc,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  nonceConfig: NonceConfig | undefined,
  lookupTableIndex: LookupTableIndex | undefined,
  onConfirmed: TransactionCallback,
): ProgramClientImpl {
  const programAddress = kitAddress(program.address);
  const accounts: Record<string, unknown> = {};
  for (const [accountName, accountDef] of Object.entries(program.accounts)) {
    accounts[accountName] = new BoundAccountImpl(
      accountDef as AccountDefinition<FieldSchema, boolean, readonly string[]>,
      program.address,
      rpc,
      accountName,
      commitment,
    );
  }

  const handler: ProxyHandler<ProgramClientImpl> = {
    get(_target: ProgramClientImpl, property: string | symbol): unknown {
      if (property === "address") return programAddress;
      if (property === "accounts") return accounts;
      if (typeof property !== "string") return undefined;
      if (property === "then") return undefined;
      if (property === "toJSON") return undefined;

      const ixDef = program.instructions[property];
      if (ixDef === undefined) return undefined;

      return createInstructionProxy(ixDef, property, program.address, rpc, signer, commitment, nonceConfig, lookupTableIndex, onConfirmed);
    },
    ownKeys(): (string | symbol)[] {
      return ["address", "accounts", ...Object.keys(program.instructions)];
    },
    has(_target: ProgramClientImpl, property: string | symbol): boolean {
      if (property === "address" || property === "accounts") return true;
      if (typeof property === "string") return property in program.instructions;
      return false;
    },
    getOwnPropertyDescriptor(_target: ProgramClientImpl, property: string | symbol): PropertyDescriptor | undefined {
      if (property === "address" || property === "accounts" || (typeof property === "string" && property in program.instructions)) {
        return { configurable: true, enumerable: true, value: this.get!(_target, property, _target) };
      }
      return undefined;
    },
  };

  return new Proxy({ address: programAddress, accounts } as ProgramClientImpl, handler);
}

interface InstructionFn {
  (params?: Record<string, unknown>): Promise<Signature>;
  send(params?: Record<string, unknown>): Promise<Signature>;
  instruction(params?: Record<string, unknown>): Promise<Instruction>;
  transaction(params?: Record<string, unknown>): Promise<SignedTransaction>;
  simulate(params?: Record<string, unknown>): Promise<SimulateResult>;
  prepare(params?: Record<string, unknown>): Promise<PrepareResult>;
  plan(params?: Record<string, unknown>): Promise<InstructionPlanResult>;
}

const instructionCache = new WeakMap<InstructionDefinition<AccountInputs, ArgsSchema | undefined>, InstructionFn>();

function createInstructionProxy(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  ixName: string,
  programId: string,
  rpc: KitRpc,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  nonceConfig: NonceConfig | undefined,
  lookupTableIndex: LookupTableIndex | undefined,
  onConfirmed: TransactionCallback,
): InstructionFn {
  const cached = instructionCache.get(ixDef);
  if (cached !== undefined) return cached;

  const snakeName = toSnake(ixName);

  const sendFn = async (inputParams?: Record<string, unknown>): Promise<Signature> => {
    const activeSigner = requireSigner(signer);
    const params = inputParams ?? {};
    const ix = await buildInstruction(ixDef, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
    const signedTx = await buildAndSignTransaction([ix], rpc, activeSigner, commitment, nonceConfig);
    return await sendAndConfirm(signedTx, rpc, onConfirmed);
  };

  const instructionFn = async (inputParams?: Record<string, unknown>): Promise<Instruction> => {
    const params = inputParams ?? {};
    return await buildInstruction(ixDef, params, programId, snakeName, signer, "unsigned", lookupTableIndex);
  };

  const transactionFn = async (inputParams?: Record<string, unknown>): Promise<SignedTransaction> => {
    const params = inputParams ?? {};
    const activeSigner = requireSigner(signer);
    const ix = await buildInstruction(ixDef, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
    return await buildAndSignTransaction([ix], rpc, activeSigner, commitment, nonceConfig);
  };

  const simulateFn = async (inputParams?: Record<string, unknown>): Promise<SimulateResult> => {
    const params = inputParams ?? {};
    const activeSigner = requireSigner(signer);
    const ix = await buildInstruction(ixDef, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
    const signedTx = await buildAndSignTransaction([ix], rpc, activeSigner, commitment, nonceConfig);
    return await runSimulation(signedTx, rpc, commitment);
  };

  const prepareFn = async (inputParams?: Record<string, unknown>): Promise<PrepareResult> => {
    const params = inputParams ?? {};
    const activeSigner = requireSigner(signer);
    const ix = await buildInstruction(ixDef, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
    const pubkeys: Record<string, KitAddress> = {};
    if (ix.accounts !== undefined) for (const meta of ix.accounts) pubkeys[meta.address] = meta.address;
    return { instruction: ix, signers: [activeSigner], pubkeys };
  };

  const planFn = async (inputParams?: Record<string, unknown>): Promise<InstructionPlanResult> => {
    const params = inputParams ?? {};
    const activeSigner = requireSigner(signer);
    const ix = await buildInstruction(ixDef, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
    return { instruction: ix, plan: { kind: "single", instruction: ix, planType: "instructionPlan" } };
  };

  const fn = Object.assign(sendFn, {
    send: sendFn,
    instruction: instructionFn,
    transaction: transactionFn,
    simulate: simulateFn,
    prepare: prepareFn,
    plan: planFn,
  }) as InstructionFn;

  instructionCache.set(ixDef, fn);
  return fn;
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
      return validateToken(name, innerOfToken(token), value, ixName);
    }
    case "vec": case "array": {
      const inner = innerOfToken(token);
      if (!Array.isArray(value)) err(`array of ${describeToken(token)}`);
      for (let i = 0; i < (value as unknown[]).length; i++) {
        validateToken(`${name}[${i}]`, inner, (value as unknown[])[i], ixName);
      }
      break;
    }
  }
}

function describeToken(token: TypeToken<unknown, TypeKind>): string {
  if (hasInnerAndSizeToken(token)) {
    switch (token.kind) {
      case "vec": return `${describeToken(token.inner)}[]`;
      case "array": return `${describeToken(token.inner)}[${token.size}]`;
    }
  }
  if (hasInnerToken(token)) {
    switch (token.kind) {
      case "option": return `${describeToken(token.inner)} | null`;
      case "vec": return `${describeToken(token.inner)}[]`;
    }
  }
  return token.kind;
}