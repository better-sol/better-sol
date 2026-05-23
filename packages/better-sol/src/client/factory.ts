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
} from "#codec";
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
} from "#program";
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
} from "./types.ts";
import { CLUSTER_URLS, CLUSTER_WS_URLS, TOKEN_2022_PROGRAM_ADDRESS } from "./types.ts";
import { resolveSigner, requireSigner } from "./signer.ts";
import { buildAndSignTransaction, buildAccountMetas, sendAndConfirm, runSimulation, withComputeBudget, createTransactionNotifier, type NonceConfig, type TransactionCallback } from "./transaction.ts";
import { buildLookupTableIndex, type LookupTableIndex } from "./lookup-tables.ts";
import { BoundAccountImpl } from "./bound-account.ts";
import { buildTokenClient } from "./token-client.ts";
import { ProgramError, TransactionFailedError, type ProgramErrorMap, buildErrorIndex, type ParsedEvent, buildEventDiscriminatorIndex, extractEventLogs, parseEventLog, decodeEventData } from "./events.ts";

export { secretKey, keypairFile } from "./signer.ts";

interface ClientCore<TPrograms extends ProgramInputs, THasSigner extends boolean> {
  readonly payer: THasSigner extends true ? KitAddress : KitAddress | null;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions | undefined;
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
  const rpc = config.rpc ?? createSolanaRpc(config.rpcUrl ?? CLUSTER_URLS[cluster]);
  const rpcSubscriptions = config.rpcSubscriptions ?? (
    config.rpcSubscriptionsUrl !== undefined
      ? createSolanaRpcSubscriptions(config.rpcSubscriptionsUrl)
      : config.rpcUrl === undefined && config.rpc === undefined
        ? createSolanaRpcSubscriptions(CLUSTER_WS_URLS[cluster])
        : undefined
  );
  if (rpcSubscriptions === undefined && config.rpc === undefined) throw new Error("Custom RPC URL requires explicit rpcSubscriptionsUrl in betterSol config.");
  const commitment = config.commitment ?? "confirmed";
  const computeUnits = config.computeUnits;
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

function toSnake(name: string): string {
  return name.replace(/([A-Z]+)([A-Z][a-z])/g, "_$1_$2").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/^_/, "");
}

interface ClientParams<TPrograms extends ProgramInputs> {
  readonly programs: TPrograms;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions | undefined;
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
    token: buildTokenClient(params.rpc, params.signer, params.rpcSubscriptions, params.commitment, TOKEN_PROGRAM_ADDRESS, nonceConfig, notifier.notify),
    token2022: buildTokenClient(params.rpc, params.signer, params.rpcSubscriptions, params.commitment, TOKEN_2022_PROGRAM_ADDRESS, nonceConfig, notifier.notify),
    withSigner: async (signerInput: SignerInput): Promise<BetterSolClient<TPrograms, true>> => {
      const nextSigner = await resolveSigner(signerInput);
      return buildClientShape<TPrograms, true>({ ...params, signer: nextSigner }) as BetterSolClient<TPrograms, true>;
    },
    getBalance: async (addressValue: AddressInput): Promise<bigint> => {
      const { value } = await params.rpc.getBalance(kitAddress(addressValue), { commitment: params.commitment }).send();
      return value;
    },
    transfer: async (transferParams: { readonly to: AddressInput; readonly amount: bigint }): Promise<Signature> => {
      const signer = requireSigner(params.signer);
      const ix = getTransferSolInstruction({ source: signer, destination: kitAddress(transferParams.to), amount: transferParams.amount });
      const signedTx = await buildAndSignTransaction([ix], params.rpc, signer, params.commitment, nonceConfig);
      return await sendAndConfirm(signedTx, params.rpc, params.rpcSubscriptions, notifier.notify, params.commitment);
    },
    send: async (instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature> => {
      const signer = requireSigner(params.signer);
      const resolved = await Promise.all(instructions);
      const withBudget = withComputeBudget(resolved, params.computeUnits);
      const signedTx = await buildAndSignTransaction(withBudget, params.rpc, signer, params.commitment, nonceConfig);
      return await sendAndConfirm(signedTx, params.rpc, params.rpcSubscriptions, notifier.notify, params.commitment);
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
      return await sendAndConfirm(signedTx, params.rpc, params.rpcSubscriptions, notifier.notify, params.commitment);
    },
    steps: async <const TOutputs extends readonly unknown[]>(stepFns: StepChain<TOutputs>): Promise<TOutputs> => {
      const results: unknown[] = [];
      for (const fn of stepFns) {
        results.push(await (fn as (...args: readonly unknown[]) => Promise<unknown>)(...results));
      }
      return stepChainResult(results, stepFns.length);
    },
    onTransaction: (callback: TransactionCallback): (() => void) => {
      return notifier.subscribe(callback);
    },
  };

  const programNamespace = {} as Record<string, unknown>;
  for (const [programName, programDef] of Object.entries(params.programs)) {
    programNamespace[programName] = createProgramClient(programDef as AnyProgram, params.rpc, params.rpcSubscriptions, params.signer, params.commitment, nonceConfig, lookupTableIndex, notifier.notify);
  }

  return { ...core, ...programNamespace } as BetterSolClientShape<TPrograms, THasSigner>;
}

interface ProgramClientImpl {
  readonly address: KitAddress;
  readonly accounts: Record<string, unknown>;
  readonly parseErrors: (logs: readonly string[]) => ProgramError | undefined;
  readonly parseEvents: (logs: readonly string[]) => Promise<readonly ParsedEvent[]>;
}

function createProgramClient(
  program: AnyProgram,
  rpc: KitRpc,
  rpcSubscriptions: KitRpcSubscriptions | undefined,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  nonceConfig: NonceConfig | undefined,
  lookupTableIndex: LookupTableIndex | undefined,
  onConfirmed: TransactionCallback,
): ProgramClientImpl {
  const programAddress = kitAddress(program.address);
  const programName = program.name;
  const errorIndex = buildErrorIndex(program.errors as Record<string, string>);

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

  const parseErrors = (logs: readonly string[]): ProgramError | undefined => {
    for (const log of logs) {
      const parsed = tryParseAnchorError(log, errorIndex, programName);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  };

  const parseLogsForError = (error: unknown): never => {
    const logs = extractLogsFromError(error);
    if (logs === undefined) throw error;
    const programError = parseErrors(logs);
    throw new TransactionFailedError(
      error instanceof Error ? error.message : String(error),
      logs,
      programError,
      error,
    );
  };

  let eventDiscriminatorCache: Promise<Map<string, { readonly name: string; readonly fields: FieldSchema }>> | undefined;
  const parseEvents = async (logs: readonly string[]): Promise<readonly ParsedEvent[]> => {
    if (Object.keys(program.events).length === 0) return [];
    if (eventDiscriminatorCache === undefined) {
      eventDiscriminatorCache = buildEventDiscriminatorIndex(program.events as Record<string, FieldSchema>, program.eventDiscriminators);
    }
    const resolvedCache = await eventDiscriminatorCache;
    const eventLogs = extractEventLogs(logs);
    const results: ParsedEvent[] = [];
    for (const log of eventLogs) {
      const parsed = parseEventLog(log, resolvedCache);
      if (parsed !== undefined) {
        results.push({ name: parsed.name, data: decodeEventData(parsed.fields, parsed.data) });
      }
    }
    return results;
  };

  const instructionMethods = new Map<string, InstructionFn>();

  const handler: ProxyHandler<ProgramClientImpl> = {
    get(_target: ProgramClientImpl, property: string | symbol): unknown {
      if (property === "address") return programAddress;
      if (property === "accounts") return accounts;
      if (property === "parseErrors") return parseErrors;
      if (property === "parseEvents") return parseEvents;
      if (typeof property !== "string") return undefined;
      if (property === "then") return undefined;
      if (property === "toJSON") return undefined;

      const ixDef = program.instructions[property];
      if (ixDef === undefined) return undefined;

      const cachedInstructionMethod = instructionMethods.get(property);
      if (cachedInstructionMethod !== undefined) return cachedInstructionMethod;

      const instructionMethod = createInstructionProxy(ixDef, property, program.address, rpc, rpcSubscriptions, signer, commitment, nonceConfig, lookupTableIndex, onConfirmed, parseLogsForError);
      instructionMethods.set(property, instructionMethod);
      return instructionMethod;
    },
    ownKeys(): (string | symbol)[] {
      return ["address", "accounts", "parseErrors", "parseEvents", ...Object.keys(program.instructions)];
    },
    has(_target: ProgramClientImpl, property: string | symbol): boolean {
      if (property === "address" || property === "accounts" || property === "parseErrors" || property === "parseEvents") return true;
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


function createInstructionProxy(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  ixName: string,
  programId: string,
  rpc: KitRpc,
  rpcSubscriptions: KitRpcSubscriptions | undefined,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  nonceConfig: NonceConfig | undefined,
  lookupTableIndex: LookupTableIndex | undefined,
  onConfirmed: TransactionCallback,
  parseLogsForError: (error: unknown) => never,
): InstructionFn {
  const snakeName = toSnake(ixName);

  const sendFn = async (inputParams?: Record<string, unknown>): Promise<Signature> => {
    const activeSigner = requireSigner(signer);
    const params = inputParams ?? {};
    const ix = await buildInstruction(ixDef, params, programId, snakeName, activeSigner, "signed", lookupTableIndex);
    const signedTx = await buildAndSignTransaction([ix], rpc, activeSigner, commitment, nonceConfig);
    try {
      return await sendAndConfirm(signedTx, rpc, rpcSubscriptions, onConfirmed, commitment);
    } catch (error) {
      parseLogsForError(error);
    }
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
    try {
      return await runSimulation(signedTx, rpc, commitment);
    } catch (error) {
      parseLogsForError(error);
    }
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

  const fn: InstructionFn = Object.assign(sendFn, {
    send: sendFn,
    instruction: instructionFn,
    transaction: transactionFn,
    simulate: simulateFn,
    prepare: prepareFn,
    plan: planFn,
  });

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
  const [accounts, data] = await Promise.all([
    buildAccountMetas(ixDef, params, programId, signer, mode, lookupTableIndex),
    buildInstructionData(snakeName, ixDef, params),
  ]);
  return { programAddress: kitAddress(programId), accounts, data };
}

async function buildInstructionData(
  snakeName: string,
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  validateArgs(ixDef.args, params, snakeName);
  if (ixDef.args === undefined || Object.keys(ixDef.args).length === 0) return ixDef.discriminator ?? await anchorDiscriminator(snakeName);
  return await encodeInstruction(snakeName, ixDef.args, params, ixDef.discriminator);
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

function validationError(name: string, ixName: string, expected: string, actual: unknown): never {
  throw new Error(
    `better-sol: instruction "${ixName}" arg "${name}" expects ${expected}, got ${typeof actual === "bigint" ? `${actual}n` : typeof actual === "string" ? `"${actual}"` : actual}`,
  );
}

function expectNumberArg(value: unknown, name: string, ixName: string, kind: string): number {
  if (typeof value !== "number") validationError(name, ixName, `${kind} (number)`, value);
  return value;
}

function expectBigIntArg(value: unknown, name: string, ixName: string, kind: string): bigint {
  if (typeof value !== "bigint") validationError(name, ixName, `${kind} (bigint)`, value);
  return value;
}

function validateToken(
  name: string,
  token: TypeToken<unknown, TypeKind>,
  value: unknown,
  ixName: string,
): void {
  switch (token.kind) {
    case "u8": {
      const num = expectNumberArg(value, name, ixName, "u8");
      if (!Number.isInteger(num) || num < 0 || num > 0xff) validationError(name, ixName, "u8 (0..255)", num);
      break;
    }
    case "u16": {
      const num = expectNumberArg(value, name, ixName, "u16");
      if (!Number.isInteger(num) || num < 0 || num > 0xffff) validationError(name, ixName, "u16 (0..65535)", num);
      break;
    }
    case "u32": {
      const num = expectNumberArg(value, name, ixName, "u32");
      if (!Number.isInteger(num) || num < 0 || num > 0xffffffff) validationError(name, ixName, "u32 (0..4294967295)", num);
      break;
    }
    case "i8": {
      const num = expectNumberArg(value, name, ixName, "i8");
      if (!Number.isInteger(num) || num < -0x80 || num > 0x7f) validationError(name, ixName, "i8 (-128..127)", num);
      break;
    }
    case "i16": {
      const num = expectNumberArg(value, name, ixName, "i16");
      if (!Number.isInteger(num) || num < -0x8000 || num > 0x7fff) validationError(name, ixName, "i16 (-32768..32767)", num);
      break;
    }
    case "i32": {
      const num = expectNumberArg(value, name, ixName, "i32");
      if (!Number.isInteger(num) || num < -0x80000000 || num > 0x7fffffff) validationError(name, ixName, "i32", num);
      break;
    }
    case "f32":
    case "f64": {
      const num = expectNumberArg(value, name, ixName, token.kind);
      if (!Number.isFinite(num)) validationError(name, ixName, `${token.kind} (finite number)`, num);
      break;
    }
    case "u64": case "u128": {
      const big = expectBigIntArg(value, name, ixName, token.kind);
      if (big < 0n) validationError(name, ixName, `${token.kind} (non-negative bigint)`, big);
      break;
    }
    case "i64": case "i128":
      expectBigIntArg(value, name, ixName, token.kind);
      break;
    case "bool":
      if (typeof value !== "boolean") validationError(name, ixName, "bool", value);
      break;
    case "pubkey":
      if (typeof value !== "string") validationError(name, ixName, "pubkey (base58 string)", value);
      break;
    case "string":
      if (typeof value !== "string") validationError(name, ixName, "string", value);
      break;
    case "bytes":
      if (!(value instanceof Uint8Array)) validationError(name, ixName, "bytes (Uint8Array)", value);
      break;
    case "option": {
      if (value === null || value === undefined) return;
      return validateToken(name, innerOfToken(token), value, ixName);
    }
    case "vec": case "array": {
      const inner = innerOfToken(token);
      if (!Array.isArray(value)) validationError(name, ixName, `array of ${describeToken(token)}`, value);
      for (let i = 0; i < value.length; i++) {
        validateToken(`${name}[${i}]`, inner, value[i], ixName);
      }
      break;
    }
    case "struct_zc_ref":
      break;
    default:
      validationError(name, ixName, `unsupported type '${token.kind}'`, value);
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
  if (token.kind === "struct_zc_ref") return "struct";
  return token.kind;
}

const ANCHOR_ERROR_LOG_PREFIX = "Program logged: \"Error: ";
const ANCHOR_ERROR_LOG_SUFFIX = "\"";

function tryParseAnchorError(logLine: string, errorIndex: ProgramErrorMap, programName: string): ProgramError | undefined {
  if (!logLine.startsWith(ANCHOR_ERROR_LOG_PREFIX) || !logLine.endsWith(ANCHOR_ERROR_LOG_SUFFIX)) return undefined;
  const errorName = logLine.slice(ANCHOR_ERROR_LOG_PREFIX.length, -ANCHOR_ERROR_LOG_SUFFIX.length);
  const entry = errorIndex.find((e: { readonly name: string }) => e.name === errorName);
  if (entry === undefined) return undefined;
  return new ProgramError(programName, entry.name, entry.index, entry.message);
}

function extractLogsFromError(error: unknown): readonly string[] | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("context" in error)) return undefined;
  const context = (error as { readonly context: unknown }).context;
  if (typeof context !== "object" || context === null) return undefined;
  if (!("logs" in context)) return undefined;
  const logs = (context as { readonly logs: unknown }).logs;
  if (!Array.isArray(logs)) return undefined;
  return logs as readonly string[];
}

function stepChainResult<TOutputs extends readonly unknown[]>(results: unknown[], expectedLength: number): TOutputs {
  if (results.length !== expectedLength) throw new Error(`better-sol: steps chain produced ${results.length} results, expected ${expectedLength}`);
  return results as unknown as TOutputs;
}