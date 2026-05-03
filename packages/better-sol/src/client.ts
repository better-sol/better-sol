import {
  AccountRole,
  address as kitAddress,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  fetchEncodedAccount,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type AccountMeta,
  type AccountSignerMeta,
  type Address as KitAddress,
  type Instruction,
  type InstructionWithSigners,
  type TransactionSigner,
  flattenInstructionPlan,
} from "@solana/kit";
import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  fetchMaybeMint,
  fetchMaybeToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getCreateMintInstructionPlan,
  getMintToCheckedInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
const TOKEN_2022_PROGRAM_ADDRESS = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Address;
import { accountDiscriminator, anchorDiscriminator, decodeAccount, decodeZeroCopyAccount, encodeField, encodeInstruction } from "./coder";
import {
  AccountConstraint,
  AccountDefinition,
  type AccountDefs,
  type AccountInputs,
  type Address,
  type ArgsSchema,
  type ErrorMessages,
  type EventSchema,
  type FieldSchema,
  type InferFields,
  type InferType,
  type InstructionDefinition,
  type Instructions,
  type ProgramDefinition,
  type TypeKind,
  type TypeToken,
} from "./program";

export type Cluster = "devnet" | "testnet" | "mainnet-beta" | "localnet";

const CLUSTER_URLS: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  localnet: "http://127.0.0.1:8899",
};

const CLUSTER_WS_URLS: Record<Cluster, string> = {
  devnet: "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  "mainnet-beta": "wss://api.mainnet-beta.solana.com",
  localnet: "ws://127.0.0.1:8900",
};

const CONFIRMATION_RETRIES = 30;
const CONFIRMATION_INTERVAL_MS = 1000;
const RPC_RETRIES = 3;
const RPC_RETRY_DELAY_MS = 1000;

type AnyProgram = ProgramDefinition<string, Address, ErrorMessages, EventSchema, Instructions, AccountDefs>;
type ProgramInputs = Record<string, AnyProgram>;
type SignedTransaction = Awaited<ReturnType<typeof signTransactionMessageWithSigners>>;

type KitRpc = ReturnType<typeof createSolanaRpc>;
type KitRpcSubscriptions = ReturnType<typeof createSolanaRpcSubscriptions>;
type StepChain<TOutputs extends readonly unknown[], TPrevious extends readonly unknown[] = readonly []> =
  TOutputs extends readonly [infer TNext, ...infer TRest]
    ? readonly [(...previous: TPrevious) => Promise<TNext>, ...StepChain<TRest, readonly [...TPrevious, TNext]>]
    : readonly [];

export type SolSigner =
  | TransactionSigner
  | { readonly type: "secretKey"; readonly value: Uint8Array }
  | { readonly type: "file"; readonly path: string };

export function secretKey(bytes: Uint8Array): SolSigner {
  return { type: "secretKey", value: bytes };
}

export function keypairFile(path: string): SolSigner {
  return { type: "file", path };
}

export type BetterSolConfig<TPrograms extends ProgramInputs = Record<string, never>> = {
  readonly cluster?: Cluster;
  readonly rpcUrl?: string;
  readonly rpcSubscriptionsUrl?: string;
  readonly payer?: SolSigner;
  readonly programs?: TPrograms;
  readonly commitment?: "processed" | "confirmed" | "finalized";
  readonly confirmationRetries?: number;
  readonly confirmationInterval?: number;
  readonly rpcRetries?: number;
  readonly simulate?: boolean;
};

type IxAccountDefs<TIx> = TIx extends InstructionDefinition<infer TAccounts, ArgsSchema | undefined> ? TAccounts : never;

type IxArgKeys<TIx> = TIx extends InstructionDefinition<AccountInputs, infer TArgs>
  ? TArgs extends ArgsSchema ? keyof TArgs & string : never
  : never;

type IxArgTypes<TIx> = TIx extends InstructionDefinition<AccountInputs, infer TArgs>
  ? TArgs extends ArgsSchema ? { [K in keyof TArgs]: InferType<TArgs[K]> } : {}
  : {};

type IxRequiredAccountKeys<TIx> = {
  [K in keyof IxAccountDefs<TIx> & string]:
    IxAccountDefs<TIx>[K] extends AccountConstraint<unknown, "signer", boolean> ? never : K;
}[keyof IxAccountDefs<TIx> & string];

type IxOptionalAccountKeys<TIx> = {
  [K in keyof IxAccountDefs<TIx> & string]:
    IxAccountDefs<TIx>[K] extends AccountConstraint<unknown, "signer", boolean> ? K : never;
}[keyof IxAccountDefs<TIx> & string];

type InstructionParams<TIx extends InstructionDefinition<AccountInputs, ArgsSchema | undefined>> = {
  [K in IxRequiredAccountKeys<TIx>]: Address;
} & {
  [K in IxOptionalAccountKeys<TIx>]?: Address;
} & {
  [K in IxArgKeys<TIx>]: K extends keyof IxArgTypes<TIx> ? IxArgTypes<TIx>[K] : never;
};

export type IxInstruction<_TIx extends InstructionDefinition<AccountInputs, ArgsSchema | undefined>> =
  Instruction & InstructionWithSigners;

export type IxTransaction<_TIx extends InstructionDefinition<AccountInputs, ArgsSchema | undefined>> =
  SignedTransaction;

type InstructionMethod<TIx> = TIx extends InstructionDefinition<AccountInputs, ArgsSchema | undefined>
  ? {
      (params: InstructionParams<TIx>): Promise<string>;
      instruction(params: InstructionParams<TIx>): Promise<IxInstruction<TIx>>;
      transaction(params: InstructionParams<TIx>): Promise<IxTransaction<TIx>>;
    }
  : never;

type ExtractInstructions<T> = T extends ProgramDefinition<string, Address, ErrorMessages, EventSchema, infer TInstructions, AccountDefs> ? TInstructions : never;
type ExtractAccountDefs<T> = T extends ProgramDefinition<string, Address, ErrorMessages, EventSchema, Instructions, infer TDefs> ? TDefs : never;

type InstructionMethods<TProgram> = {
  [K in keyof ExtractInstructions<TProgram>]: InstructionMethod<ExtractInstructions<TProgram>[K]>;
};

type SeedableKeysOf<TFields extends FieldSchema> = {
  [K in keyof TFields]: TFields[K] extends TypeToken<unknown, infer TKind>
    ? TKind extends "u8" | "u16" | "u32" | "u64" | "u128" | "i8" | "i16" | "i32" | "i64" | "i128" | "pubkey" ? K : never
    : never;
}[keyof TFields] & string;

type ExtractSeedField<S extends string> = S extends `{${infer Field}}` ? Field : never;
type SeedFieldNames<Seeds extends readonly string[]> = ExtractSeedField<Seeds[number]>;

type SeedFieldValue<TFields extends FieldSchema, K extends string> =
  K extends keyof TFields ? TFields[K] extends TypeToken<infer TValue, infer TKind>
    ? TKind extends "pubkey" ? Address : TValue
    : never : never;

type DeriveInput<TFields extends FieldSchema, TSeeds extends readonly string[]> = string extends TSeeds[number]
  ? Partial<{ [K in SeedableKeysOf<TFields>]: unknown }>
  : { [K in SeedFieldNames<TSeeds>]: SeedFieldValue<TFields, K> };

export interface BoundAccount<TFields extends FieldSchema, TSeeds extends readonly string[]> {
  derive(values: DeriveInput<TFields, TSeeds>): Promise<Address>;
  fetch(address: Address): Promise<InferFields<TFields> | null>;
}

type AccountNamespace<TDefs extends AccountDefs> = {
  [K in keyof TDefs]: TDefs[K] extends AccountDefinition<infer TFields, boolean, infer TSeeds>
    ? BoundAccount<TFields, TSeeds>
    : never;
};

type ProgramClient<TProgram> = {
  readonly address: Address;
  readonly accounts: AccountNamespace<ExtractAccountDefs<TProgram>>;
} & InstructionMethods<TProgram>;

export type TokenClient = {
  getATA(params: { readonly owner: Address; readonly mint: Address }): Promise<Address>;
  createMint(params: { readonly decimals: number; readonly authority?: Address; readonly freezeAuthority?: Address | null }): Promise<{ readonly mint: Address; readonly mintSigner: TransactionSigner; readonly signature: string }>;
  mintTo(params: { readonly mint: Address; readonly destination: Address; readonly amount: bigint; readonly decimals?: number }): Promise<string>;
  transfer(params: { readonly mint: Address; readonly to: Address; readonly amount: bigint; readonly from?: Address; readonly decimals?: number }): Promise<string>;
  getBalance(params: { readonly owner: Address; readonly mint: Address }): Promise<bigint>;
};

export type BetterSolClient<TPrograms extends ProgramInputs = Record<string, never>, THasSigner extends boolean = boolean> = {
  readonly payer: THasSigner extends true ? Address : Address | null;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly token: TokenClient;
  readonly token2022: TokenClient;
  withSigner(signer: SolSigner): Promise<BetterSolClient<TPrograms, true>>;
  send(instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<string>;
  steps<const TOutputs extends readonly unknown[]>(steps: StepChain<TOutputs>): Promise<TOutputs>;
  getBalance(address: Address): Promise<bigint>;
  transfer(params: { readonly to: Address; readonly amount: bigint; readonly from?: Address }): Promise<string>;
} & {
  [K in keyof TPrograms]: TPrograms[K] extends AnyProgram ? ProgramClient<TPrograms[K]> : never;
};

class BoundAccountImpl<TFields extends FieldSchema, TSeeds extends readonly string[]> implements BoundAccount<TFields, TSeeds> {
  public constructor(
    private readonly definition: AccountDefinition<TFields, boolean, TSeeds>,
    private readonly programAddress: Address,
    private readonly rpc: KitRpc,
    private readonly accountName: string,
    private readonly commitment: "processed" | "confirmed" | "finalized",
  ) {}

  public async derive(values: DeriveInput<TFields, TSeeds>): Promise<Address> {
    const seeds = this.definition.seedValues.map((template) => {
      if (!template.startsWith("{")) return new TextEncoder().encode(template);
      const fieldName = template.slice(1, -1);
      const token = this.definition.fields[fieldName];
      const raw = (values as Record<string, unknown>)[fieldName];
      return seedToBytes(token, raw);
    });
    const [pda] = await getProgramDerivedAddress({ programAddress: kitAddress(this.programAddress), seeds });
    return pda;
  }

  public async fetch(address: Address): Promise<InferFields<TFields> | null> {
    const account = await fetchEncodedAccount(this.rpc, kitAddress(address), { commitment: this.commitment });
    if (!account.exists || account.data.length === 0) return null;
    if (account.programAddress !== kitAddress(this.programAddress)) return null;
    const disc = await accountDiscriminator(this.accountName);
    if (!account.data.subarray(0, 8).every((b, i) => b === disc[i])) return null;
    const data = new Uint8Array(account.data.subarray(8));
    return this.definition.zeroCopyEnabled
      ? decodeZeroCopyAccount(this.definition.fields, data)
      : decodeAccount(this.definition.fields, data);
  }
}

export async function betterSol<const TPrograms extends ProgramInputs = Record<string, never>>(
  config: BetterSolConfig<TPrograms> & { readonly payer: SolSigner },
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
  const confirmationRetries = config.confirmationRetries ?? CONFIRMATION_RETRIES;
  const confirmationInterval = config.confirmationInterval ?? CONFIRMATION_INTERVAL_MS;
  const rpcRetries = config.rpcRetries ?? RPC_RETRIES;
  const simulate = config.simulate ?? false;
  const rpc = createSolanaRpc(rpcUrl);
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl);
  const signer = config.payer === undefined ? undefined : await resolveSigner(config.payer);
  const programs = config.programs ?? {} as TPrograms;
  return buildClient({ config, programs, rpc, rpcSubscriptions, signer, commitment, confirmationRetries, confirmationInterval, rpcRetries, simulate });
}

function buildClient<const TPrograms extends ProgramInputs, THasSigner extends boolean = boolean>(params: {
  readonly config: BetterSolConfig<TPrograms>;
  readonly programs: TPrograms;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly signer: TransactionSigner | undefined;
  readonly commitment: "processed" | "confirmed" | "finalized";
  readonly confirmationRetries: number;
  readonly confirmationInterval: number;
  readonly rpcRetries: number;
  readonly simulate: boolean;
}): BetterSolClient<TPrograms, THasSigner> {
  const sendFn = (tx: SignedTransaction): Promise<string> =>
    sendAndConfirm(tx, params.rpc, params.commitment, params.confirmationRetries, params.confirmationInterval, params.rpcRetries, params.simulate);
  const client: Record<string, unknown> = {
    payer: params.signer?.address ?? null,
    rpc: params.rpc,
    rpcSubscriptions: params.rpcSubscriptions,
    token: buildTokenClient(params.rpc, params.rpcSubscriptions, params.signer, params.commitment, sendFn, params.rpcRetries, TOKEN_PROGRAM_ADDRESS),
    token2022: buildTokenClient(params.rpc, params.rpcSubscriptions, params.signer, params.commitment, sendFn, params.rpcRetries, TOKEN_2022_PROGRAM_ADDRESS as Address),
    withSigner: async (signerInput: SolSigner): Promise<BetterSolClient<TPrograms, true>> => {
      const nextSigner = await resolveSigner(signerInput);
      return buildClient<TPrograms, true>({ ...params, signer: nextSigner });
    },
    getBalance: async (addressValue: Address): Promise<bigint> => {
      const { value } = await params.rpc.getBalance(kitAddress(addressValue), { commitment: params.commitment }).send();
      return value;
    },
    transfer: async (transferParams: { readonly to: Address; readonly amount: bigint; readonly from?: Address }): Promise<string> => {
      const signer = requireSigner(params.signer);
      const sourceAddress = transferParams.from ?? signer.address;
      if (kitAddress(sourceAddress) !== signer.address) throw new Error("Source must match the active signer. Use sol.withSigner() for a different signer.");
      const ix = getTransferSolInstruction({
        source: signer,
        destination: kitAddress(transferParams.to),
        amount: transferParams.amount,
      });
      const signedTx = await buildAndSignTransaction([ix], params.rpc, signer, params.commitment, params.rpcRetries);
      return await sendFn(signedTx);
    },
    send: async (instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<string> => {
      const signer = requireSigner(params.signer);
      const resolved = await Promise.all(instructions);
      const signedTx = await buildAndSignTransaction(resolved, params.rpc, signer, params.commitment, params.rpcRetries);
      return await sendFn(signedTx);
    },
    steps: async (stepFns: readonly ((...prev: unknown[]) => Promise<unknown>)[]): Promise<unknown[]> => {
      const results: unknown[] = [];
      for (const fn of stepFns) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await fn(...results));
      }
      return results;
    },
  };

  for (const [programName, programDef] of Object.entries(params.programs)) {
    client[programName] = buildProgramClient(
      programDef as AnyProgram,
      params.rpc,
      params.signer,
      params.commitment,
      sendFn,
      params.rpcRetries,
    );
  }

  return client as unknown as BetterSolClient<TPrograms, THasSigner>;
}

function buildProgramClient(
  program: AnyProgram,
  rpc: KitRpc,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  sendFn: (tx: SignedTransaction) => Promise<string>,
  rpcRetries: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = { address: program.address };

  for (const [ixName, ixDef] of Object.entries(program.instructions)) {
    const def = ixDef as InstructionDefinition<AccountInputs, ArgsSchema | undefined>;
    const snakeName = toSnake(ixName);
    const programId = program.address;

    const sendAndConfirmFn = async (params: Record<string, unknown>): Promise<string> => {
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner);
      const signedTx = await buildAndSignTransaction([ix], rpc, activeSigner, commitment, rpcRetries);
      return await sendFn(signedTx);
    };

    const instructionFn = async (params: Record<string, unknown>): Promise<Instruction & InstructionWithSigners> => {
      const activeSigner = requireSigner(signer);
      return await buildInstruction(def, params, programId, snakeName, activeSigner);
    };

    const transactionFn = async (params: Record<string, unknown>): Promise<SignedTransaction> => {
      const activeSigner = requireSigner(signer);
      const ix = await buildInstruction(def, params, programId, snakeName, activeSigner);
      return await buildAndSignTransaction([ix], rpc, activeSigner, commitment, rpcRetries);
    };

    const method = sendAndConfirmFn as unknown as Record<string, unknown>;
    method.instruction = instructionFn;
    method.transaction = transactionFn;
    result[ixName] = method;
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

function buildTokenClient(
  rpc: KitRpc,
  rpcSubscriptions: KitRpcSubscriptions,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  sendFn: (tx: SignedTransaction) => Promise<string>,
  rpcRetries: number,
  tokenProgramAddress: Address,
): TokenClient {
  const deriveAtaAddr = async (owner: Address, mint: Address): Promise<Address> => {
    const [ata] = await findAssociatedTokenPda({ owner: kitAddress(owner), tokenProgram: kitAddress(tokenProgramAddress), mint: kitAddress(mint) });
    return ata;
  };
  return {
    getATA: async (params) => await deriveAtaAddr(params.owner, params.mint),
    createMint: async (params) => {
      const activeSigner = requireSigner(signer);
      const mint = await createGeneratedSigner();
      const plan = getCreateMintInstructionPlan({
        payer: activeSigner,
        newMint: mint,
        decimals: params.decimals,
        mintAuthority: kitAddress(params.authority ?? activeSigner.address),
        freezeAuthority: params.freezeAuthority === undefined ? null : params.freezeAuthority === null ? null : kitAddress(params.freezeAuthority),
      }, { tokenProgram: kitAddress(tokenProgramAddress) });
      const instructions = flattenInstructionPlan(plan).flatMap((leaf) => leaf.kind === "single" ? [leaf.instruction] : []);
      const signedTx = await buildAndSignTransaction(instructions, rpc, activeSigner, commitment, rpcRetries);
      const sig = await sendFn(signedTx);
      return { mint: mint.address, mintSigner: mint, signature: sig };
    },
    mintTo: async (params) => {
      const activeSigner = requireSigner(signer);
      const mint = kitAddress(params.mint);
      const owner = kitAddress(params.destination);
      const ata = kitAddress(await deriveAtaAddr(params.destination, params.mint));
      const decimals = params.decimals ?? await fetchMintDecimals(rpc, params.mint, tokenProgramAddress);
      const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: activeSigner, owner, mint, tokenProgram: kitAddress(tokenProgramAddress) });
      const mintIx = getMintToCheckedInstruction({ mint, token: ata, mintAuthority: activeSigner, amount: params.amount, decimals }, { programAddress: kitAddress(tokenProgramAddress) });
      const signedTx = await buildAndSignTransaction([createAtaIx, mintIx], rpc, activeSigner, commitment, rpcRetries);
      return await sendFn(signedTx);
    },
    transfer: async (params) => {
      const activeSigner = requireSigner(signer);
      const mint = kitAddress(params.mint);
      const sourceOwner = params.from ?? activeSigner.address;
      if (sourceOwner !== activeSigner.address) throw new Error("Token transfer source must match the active signer. Use sol.withSigner() for another owner.");
      const source = kitAddress(await deriveAtaAddr(sourceOwner, params.mint));
      const destination = kitAddress(await deriveAtaAddr(params.to, params.mint));
      const decimals = params.decimals ?? await fetchMintDecimals(rpc, params.mint, tokenProgramAddress);
      const createDestinationIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
        payer: activeSigner,
        owner: kitAddress(params.to),
        mint,
        tokenProgram: kitAddress(tokenProgramAddress),
      });
      const transferIx = getTransferCheckedInstruction({
        source,
        mint,
        destination,
        authority: activeSigner,
        amount: params.amount,
        decimals,
      }, { programAddress: kitAddress(tokenProgramAddress) });
      const signedTx = await buildAndSignTransaction([createDestinationIx, transferIx], rpc, activeSigner, commitment, rpcRetries);
      return await sendFn(signedTx);
    },
    getBalance: async (params) => {
      const ata = await deriveAtaAddr(params.owner, params.mint);
      const tokenAccount = await fetchMaybeToken(rpc, kitAddress(ata), { commitment });
      return tokenAccount.exists ? tokenAccount.data.amount : 0n;
    },
  };
}

async function buildInstruction(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
  programId: string,
  snakeName: string,
  signer: TransactionSigner,
): Promise<Instruction & InstructionWithSigners> {
  const accounts = buildAccountMetas(ixDef, params, signer);
  const data = await buildInstructionData(snakeName, ixDef, params);
  return { programAddress: kitAddress(programId), accounts, data };
}

async function buildAndSignTransaction(
  instructions: readonly Instruction[],
  rpc: KitRpc,
  signer: TransactionSigner,
  commitment: "processed" | "confirmed" | "finalized",
  rpcRetries: number,
): Promise<SignedTransaction> {
  const { value: latestBlockhash } = await withRetry(
    () => rpc.getLatestBlockhash({ commitment }).send(),
    rpcRetries,
    RPC_RETRY_DELAY_MS,
  );
  const message = appendTransactionMessageInstructions(
    instructions,
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version: 0 })),
    ),
  );
  return await signTransactionMessageWithSigners(message);
}

async function sendAndConfirm(
  transaction: SignedTransaction,
  rpc: KitRpc,
  commitment: "processed" | "confirmed" | "finalized",
  confirmationRetries: number = CONFIRMATION_RETRIES,
  confirmationInterval: number = CONFIRMATION_INTERVAL_MS,
  rpcRetries: number = RPC_RETRIES,
  simulate: boolean = false,
): Promise<string> {
  const signature = getSignatureFromTransaction(transaction);

  if (simulate) {
    const simResult = await withRetry(
      () => rpc.simulateTransaction(
        getBase64EncodedWireTransaction(transaction),
        { encoding: "base64", sigVerify: true, commitment },
      ).send(),
      rpcRetries,
      RPC_RETRY_DELAY_MS,
    );
    if (simResult.value.err !== null && simResult.value.err !== undefined) {
      const errStr = typeof simResult.value.err === "string" ? simResult.value.err : JSON.stringify(simResult.value.err);
      const logs = simResult.value.logs?.join("\n") ?? "";
      throw new Error(`Transaction simulation failed: ${errStr}\nLogs:\n${logs}`);
    }
  }
  await withRetry(
    () => rpc.sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: "base64" }).send(),
    rpcRetries,
    RPC_RETRY_DELAY_MS,
  );

  for (let attempt = 0; attempt < confirmationRetries; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const { value: statuses } = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send();
    const status = statuses[0];
    if (status !== null && status !== undefined && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      return signature;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, confirmationInterval));
  }
  throw new Error(`Transaction ${signature} not confirmed within ${confirmationRetries * confirmationInterval}ms`);
}

function buildAccountMetas(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
  signer: TransactionSigner,
): readonly (AccountMeta | AccountSignerMeta)[] {
  const accountMetas: (AccountMeta | AccountSignerMeta)[] = [];

  let omittedSignerCount = 0;
  for (const [name, input] of Object.entries(ixDef.accounts)) {
    if (input instanceof AccountConstraint && input.constraintKind === "signer" && params[name] === undefined) {
      omittedSignerCount++;
    }
  }
  if (omittedSignerCount > 1) {
    throw new Error("Multiple signer accounts omitted. Pass explicit addresses for all but one signer, or use sol.withSigner() for a different signer.");
  }

  for (const [name, input] of Object.entries(ixDef.accounts)) {
    let isSigner = false;
    let isWritable = false;
    let accountAddress: KitAddress;

    if (input instanceof AccountConstraint) {
      const kind = input.constraintKind;
      isSigner = kind === "signer";
      isWritable = kind === "init" || kind === "close" || input.mutable;
      const paramAddr = params[name];

      if (isSigner && paramAddr === undefined) {
        accountAddress = signer.address;
      } else if (typeof paramAddr === "string") {
        accountAddress = kitAddress(paramAddr);
        if (isSigner && accountAddress !== signer.address) throw new Error(`Signer '${name}' must match the active signer. Use sol.withSigner() for another signer.`);
      } else if (kind === "systemProgram") {
        accountAddress = SYSTEM_PROGRAM_ADDRESS;
      } else {
        throw new Error(`Missing account '${name}'`);
      }
    } else {
      const paramAddr = params[name];
      if (typeof paramAddr !== "string") throw new Error(`Missing account '${name}'`);
      accountAddress = kitAddress(paramAddr);
    }

    const role = isSigner
      ? isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER
      : isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;

    if (isSigner) {
      accountMetas.push({ address: accountAddress, role, signer });
    } else {
      accountMetas.push({ address: accountAddress, role });
    }
  }

  const hasInit = Object.values(ixDef.accounts).some(
    (input) => input instanceof AccountConstraint && input.constraintKind === "init",
  );
  const alreadyHasSystemProgram = accountMetas.some((meta) => meta.address === SYSTEM_PROGRAM_ADDRESS);
  if (hasInit && !alreadyHasSystemProgram) {
    accountMetas.push({ address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY });
  }

  return accountMetas;
}

async function buildInstructionData(
  snakeName: string,
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  if (ixDef.args === undefined || Object.keys(ixDef.args).length === 0) return await anchorDiscriminator(snakeName);
  return await encodeInstruction(snakeName, ixDef.args, params);
}

async function fetchMintDecimals(rpc: KitRpc, mint: Address, tokenProgramAddress: Address): Promise<number> {
  const mintAccount = await fetchMaybeMint(rpc, kitAddress(mint));
  if (!mintAccount.exists) throw new Error(`Mint not found: ${mint}`);
  if (mintAccount.programAddress !== kitAddress(tokenProgramAddress)) throw new Error(`Mint ${mint} is not owned by token program ${tokenProgramAddress}`);
  return mintAccount.data.decimals;
}

function seedToBytes(token: TypeToken<unknown, TypeKind> | undefined, value: unknown): Uint8Array {
  if (token === undefined) {
    if (typeof value === "string") return new Uint8Array(getAddressEncoder().encode(kitAddress(value)));
    if (typeof value === "number" || typeof value === "bigint") return encodeU64Seed(BigInt(value));
    throw new Error(`Cannot encode seed value: ${String(value)}`);
  }
  const kind = token.kind;
  if (kind === "pubkey") return new Uint8Array(getAddressEncoder().encode(kitAddress(String(value))));
  if (["u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128"].includes(kind)) {
    return new Uint8Array(encodeField(token, value));
  }
  throw new Error(`Unsupported PDA seed type: ${kind}`);
}

function encodeU64Seed(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) buf[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  return buf;
}

function requireSigner(signer: TransactionSigner | undefined): TransactionSigner {
  if (signer !== undefined) return signer;
  throw new Error("No signer configured. Pass payer: keypairFile('./keypair.json') or payer: secretKey(bytes) to betterSol(), or call sol.withSigner(walletAdapter(wallet)) in browser flows.");
}

async function resolveSigner(signer: SolSigner | undefined): Promise<TransactionSigner> {
  if (signer === undefined) throw new Error("No signer configured. Pass keypairFile('./keypair.json'), secretKey(bytes), or a Kit TransactionSigner.");
  if (isTransactionSignerInput(signer)) return signer;
  if (signer.type === "secretKey") return await createKeyPairSignerFromBytes(signer.value, false);
  if (signer.type === "file") return await loadKeypairFile(signer.path);
  signer satisfies never;
  throw new Error("Unknown signer type");
}

async function createGeneratedSigner(): Promise<TransactionSigner> {
  const { generateKeyPairSigner } = await import("@solana/kit");
  return await generateKeyPairSigner();
}

function isTransactionSignerInput(value: SolSigner): value is TransactionSigner {
  return "address" in value && ("signTransactions" in value || "modifyAndSignTransactions" in value || "signAndSendTransactions" in value);
}

async function loadKeypairFile(path: string): Promise<TransactionSigner> {
  if (typeof globalThis.process === "undefined") {
    throw new Error("File-based keypairs require Node.js. Use secretKey() or a Kit TransactionSigner in browsers.");
  }
  const fs = await import("node:fs/promises");
  const pathModule = await import("node:path");
  const resolved = pathModule.resolve(path);
  const parsed = JSON.parse(await fs.readFile(resolved, "utf8")) as unknown;
  const bytes = readSecretKeyBytes(parsed);
  return await createKeyPairSignerFromBytes(bytes, false);
}

function readSecretKeyBytes(value: unknown): Uint8Array {
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return new Uint8Array(value);
  if (typeof value === "object" && value !== null && "secretKey" in value) {
    const keyBytes = (value as { readonly secretKey: unknown }).secretKey;
    if (Array.isArray(keyBytes) && keyBytes.every((item) => typeof item === "number")) return new Uint8Array(keyBytes);
  }
  throw new Error("Invalid keypair file");
}

function toSnake(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

async function withRetry<T>(fn: () => Promise<T>, retries: number, delayMs: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryableError(error)) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      } else {
        throw lastError;
      }
    }
  }
  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  return true;
}
