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
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type AccountMeta,
  type AccountSignerMeta,
  type Address as KitAddress,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Instruction,
  type Rpc,
  type RpcSubscriptions,
  type Signature,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
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
const TOKEN_2022_PROGRAM_ADDRESS = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as KitAddress;
import { accountDiscriminator, anchorDiscriminator, decodeAccount, decodeZeroCopyAccount, encodeField, encodeInstruction } from "./coder";
import {
  AccountConstraint,
  AccountDefinition,
  type AccountDefs,
  type AccountInputs,
  type Address as ProgramAddress,
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

export type Cluster = "devnet" | "testnet" | "mainnet" | "localnet";

const CLUSTER_URLS: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

const CLUSTER_WS_URLS: Record<Cluster, string> = {
  devnet: "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  mainnet: "wss://api.mainnet.solana.com",
  localnet: "ws://127.0.0.1:8900",
};

const CLOCK_SYSVAR_ADDRESS = "SysvarC1ock11111111111111111111111111111111" as KitAddress;
const CONFIRMATION_RETRIES = 30;
const CONFIRMATION_INTERVAL_MS = 1000;

type AnyProgram = ProgramDefinition<string, ProgramAddress, ErrorMessages, EventSchema, Instructions, AccountDefs>;
type ProgramInputs = Record<string, AnyProgram>;
type KitRpc = Rpc<SolanaRpcApi & GetAccountInfoApi & GetMultipleAccountsApi>;
type KitRpcSubscriptions = RpcSubscriptions<SolanaRpcSubscriptionsApi>;
type AddressInput = string | KitAddress;

type SignedTransaction = Awaited<ReturnType<typeof signTransactionMessageWithSigners>>;

type SecretKeySignerInput = { readonly type: "secretKey"; readonly value: Uint8Array };
type KeypairFileSignerInput = { readonly type: "file"; readonly path: string };
type SignerInput = TransactionSigner | SecretKeySignerInput | KeypairFileSignerInput;

export function secretKey(bytes: Uint8Array): SecretKeySignerInput {
  return { type: "secretKey", value: bytes };
}

export function keypairFile(path: string): KeypairFileSignerInput {
  return { type: "file", path };
}

export type BetterSolConfig<TPrograms extends ProgramInputs = Record<string, never>> = {
  readonly cluster?: Cluster;
  readonly rpcUrl?: string;
  readonly rpcSubscriptionsUrl?: string;
  readonly payer?: SignerInput;
  readonly programs?: TPrograms;
  readonly commitment?: "processed" | "confirmed" | "finalized";
};

type StepChain<TOutputs extends readonly unknown[], TPrevious extends readonly unknown[] = readonly []> =
  TOutputs extends readonly [infer TNext, ...infer TRest]
    ? readonly [(...previous: TPrevious) => Promise<TNext>, ...StepChain<TRest, readonly [...TPrevious, TNext]>]
    : readonly [];

type IxAccountDefs<TIx> = TIx extends InstructionDefinition<infer TAccounts, ArgsSchema | undefined> ? TAccounts : never;

type IxArgKeys<TIx> = TIx extends InstructionDefinition<AccountInputs, infer TArgs>
  ? TArgs extends ArgsSchema ? keyof TArgs & string : never
  : never;

type IxArgTypes<TIx> = TIx extends InstructionDefinition<AccountInputs, infer TArgs>
  ? TArgs extends ArgsSchema ? { [K in keyof TArgs]: InferType<TArgs[K]> } : Record<never, never>
  : Record<never, never>;

type IxRequiredAccountKeys<TIx> = {
  [K in keyof IxAccountDefs<TIx> & string]:
    IxAccountDefs<TIx>[K] extends AccountConstraint<unknown, infer TKind, boolean>
      ? TKind extends AutoAccountConstraintKind ? never : K
      : K;
}[keyof IxAccountDefs<TIx> & string];

type IxOptionalAccountKeys<TIx> = {
  [K in keyof IxAccountDefs<TIx> & string]:
    IxAccountDefs<TIx>[K] extends AccountConstraint<unknown, infer TKind, boolean>
      ? TKind extends AutoAccountConstraintKind ? K : never
      : never;
}[keyof IxAccountDefs<TIx> & string];

type AutoAccountConstraintKind = "signer" | "systemProgram" | "tokenProgram" | "token2022Program" | "clock";

type AccountParamValue<TInput> =
  TInput extends AccountConstraint<unknown, "remaining", boolean> ? readonly AddressInput[] :
  AddressInput;

type RequiredKeys<TValue> = {
  [K in keyof TValue]-?: Record<string, never> extends Pick<TValue, K> ? never : K;
}[keyof TValue];

type Prettify<T> = { [K in keyof T]: T[K] } & Record<never, never>;

type EmptyToNever<T> = T extends never ? never : T;
type SafeRequiredKeys<TIx> = EmptyToNever<IxRequiredAccountKeys<TIx>>;
type SafeOptionalKeys<TIx> = EmptyToNever<IxOptionalAccountKeys<TIx>>;
type SafeArgKeys<TIx> = EmptyToNever<IxArgKeys<TIx>>;

type InstructionParams<TIx extends InstructionDefinition<AccountInputs, ArgsSchema | undefined>> =
  Prettify<
    (SafeRequiredKeys<TIx> extends never ? Record<never, never> : { [K in SafeRequiredKeys<TIx> & string]: AccountParamValue<IxAccountDefs<TIx>[K]> }) &
    (SafeOptionalKeys<TIx> extends never ? Record<never, never> : { [K in SafeOptionalKeys<TIx> & string]?: AccountParamValue<IxAccountDefs<TIx>[K]> }) &
    (SafeArgKeys<TIx> extends never ? Record<never, never> : { [K in SafeArgKeys<TIx> & string]: K extends keyof IxArgTypes<TIx> ? IxArgTypes<TIx>[K] : never })
  >;

type SimulateResult = { readonly logs: readonly string[]; readonly unitsConsumed: bigint; readonly returnData: Uint8Array | null };

type PrepareResult = {
  readonly instruction: Instruction;
  readonly signers: readonly TransactionSigner[];
  readonly pubkeys: Record<string, KitAddress>;
};

type InstructionMethod<TIx> = TIx extends InstructionDefinition<AccountInputs, ArgsSchema | undefined>
  ? RequiredKeys<InstructionParams<TIx>> extends never
    ? {
        (params?: InstructionParams<TIx>): Promise<Signature>;
        send(params?: InstructionParams<TIx>): Promise<Signature>;
        instruction(params?: InstructionParams<TIx>): Promise<Instruction>;
        transaction(params?: InstructionParams<TIx>): Promise<SignedTransaction>;
        simulate(params?: InstructionParams<TIx>): Promise<SimulateResult>;
        prepare(params?: InstructionParams<TIx>): Promise<PrepareResult>;
      }
    : {
        (params: InstructionParams<TIx>): Promise<Signature>;
        send(params: InstructionParams<TIx>): Promise<Signature>;
        instruction(params: InstructionParams<TIx>): Promise<Instruction>;
        transaction(params: InstructionParams<TIx>): Promise<SignedTransaction>;
        simulate(params: InstructionParams<TIx>): Promise<SimulateResult>;
        prepare(params: InstructionParams<TIx>): Promise<PrepareResult>;
      }
  : never;

type ExtractInstructions<T> = T extends ProgramDefinition<string, ProgramAddress, ErrorMessages, EventSchema, infer TInstructions, AccountDefs> ? TInstructions : never;
type ExtractAccountDefs<T> = T extends ProgramDefinition<string, ProgramAddress, ErrorMessages, EventSchema, Instructions, infer TDefs> ? TDefs : never;

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
    ? TKind extends "pubkey" ? AddressInput : TValue
    : never : never;

type DeriveInput<TFields extends FieldSchema, TSeeds extends readonly string[]> = string extends TSeeds[number]
  ? Partial<{ [K in SeedableKeysOf<TFields>]: unknown }>
  : { [K in SeedFieldNames<TSeeds>]: SeedFieldValue<TFields, K> };

export type BoundAccount<TFields extends FieldSchema, TSeeds extends readonly string[]> = {
  derive(values: DeriveInput<TFields, TSeeds>): Promise<KitAddress>;
  fetch(address: AddressInput): Promise<InferFields<TFields> | null>;
  fetchMultiple(addresses: readonly AddressInput[]): Promise<(InferFields<TFields> | null)[]>;
};

type AccountNamespace<TDefs extends AccountDefs> = {
  [K in keyof TDefs]: TDefs[K] extends AccountDefinition<infer TFields, boolean, infer TSeeds>
    ? BoundAccount<TFields, TSeeds>
    : never;
};

type ProgramClient<TProgram> = {
  readonly address: KitAddress;
  readonly accounts: AccountNamespace<ExtractAccountDefs<TProgram>>;
} & InstructionMethods<TProgram>;

type TokenClient = {
  getATA(params: { readonly owner: AddressInput; readonly mint: AddressInput }): Promise<KitAddress>;
  createMint(params: { readonly decimals: number; readonly authority?: AddressInput; readonly freezeAuthority?: AddressInput | null }): Promise<{ readonly mint: KitAddress; readonly mintSigner: TransactionSigner; readonly signature: Signature }>;
  mintTo(params: { readonly mint: AddressInput; readonly to: AddressInput; readonly amount: bigint; readonly decimals?: number }): Promise<Signature>;
  transfer(params: { readonly mint: AddressInput; readonly to: AddressInput; readonly amount: bigint; readonly from?: AddressInput; readonly decimals?: number }): Promise<Signature>;
  getBalance(params: { readonly owner: AddressInput; readonly mint: AddressInput }): Promise<bigint>;
};

export type BetterSolClient<TPrograms extends ProgramInputs = Record<string, never>, THasSigner extends boolean = boolean> = {
  readonly payer: THasSigner extends true ? KitAddress : KitAddress | null;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly token: TokenClient;
  readonly token2022: TokenClient;
  withSigner(signer: SignerInput): Promise<BetterSolClient<TPrograms, true>>;
  send(instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature>;
  steps<const TOutputs extends readonly unknown[]>(steps: StepChain<TOutputs>): Promise<TOutputs>;
  getBalance(address: AddressInput): Promise<bigint>;
  transfer(params: { readonly to: AddressInput; readonly amount: bigint; readonly from?: AddressInput }): Promise<Signature>;
} & {
  [K in keyof TPrograms]: TPrograms[K] extends AnyProgram ? ProgramClient<TPrograms[K]> : never;
};

class BoundAccountImpl<TFields extends FieldSchema, TSeeds extends readonly string[]> implements BoundAccount<TFields, TSeeds> {
  public constructor(
    private readonly definition: AccountDefinition<TFields, boolean, TSeeds>,
    private readonly programAddress: AddressInput,
    private readonly rpc: KitRpc,
    private readonly accountName: string,
    private readonly commitment: "processed" | "confirmed" | "finalized",
  ) {}

  public async derive(values: DeriveInput<TFields, TSeeds>): Promise<KitAddress> {
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

  public async fetch(address: AddressInput): Promise<InferFields<TFields> | null> {
    return await this.decodeAccount(address);
  }

  public async fetchMultiple(addresses: readonly AddressInput[]): Promise<(InferFields<TFields> | null)[]> {
    return await Promise.all(addresses.map((addr) => this.decodeAccount(addr)));
  }

  private async decodeAccount(address: AddressInput): Promise<InferFields<TFields> | null> {
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
  const rpc = createSolanaRpc(rpcUrl);
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl);
  const signer = config.payer === undefined ? undefined : await resolveSigner(config.payer);
  const programs = config.programs ?? {} as TPrograms;
  return buildClient({ programs, rpc, rpcSubscriptions, signer, commitment });
}

function buildClient<const TPrograms extends ProgramInputs, THasSigner extends boolean = boolean>(params: {
  readonly programs: TPrograms;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly signer: TransactionSigner | undefined;
  readonly commitment: "processed" | "confirmed" | "finalized";
}): BetterSolClient<TPrograms, THasSigner> {
  const client: Record<string, unknown> = {
    payer: params.signer?.address ?? null,
    rpc: params.rpc,
    rpcSubscriptions: params.rpcSubscriptions,
    token: buildTokenClient(params.rpc, params.signer, params.commitment, TOKEN_PROGRAM_ADDRESS),
    token2022: buildTokenClient(params.rpc, params.signer, params.commitment, TOKEN_2022_PROGRAM_ADDRESS),
    withSigner: async (signerInput: SignerInput): Promise<BetterSolClient<TPrograms, true>> => {
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
      return await sendAndConfirm(signedTx, params.rpc, params.commitment);
    },
    send: async (instructions: readonly (Instruction | Promise<Instruction>)[]): Promise<Signature> => {
      const signer = requireSigner(params.signer);
      const resolved = await Promise.all(instructions);
      const signedTx = await buildAndSignTransaction(resolved, params.rpc, signer, params.commitment);
      return await sendAndConfirm(signedTx, params.rpc, params.commitment);
    },
    steps: async (stepFns: readonly ((...prev: unknown[]) => Promise<unknown>)[]): Promise<unknown[]> => {
      const results: unknown[] = [];
      await stepFns.reduce<Promise<void>>(async (previous, fn) => {
        await previous;
        results.push(await fn(...results));
      }, Promise.resolve());
      return results;
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
      return await sendAndConfirm(signedTx, rpc, commitment);
    };

    const instructionFn = async (inputParams?: Record<string, unknown>): Promise<Instruction> => {
      const params = inputParams ?? {};
      return await buildInstruction(def, params, programId, snakeName, signer, "unsigned");
    };

    const transactionFn = async (inputParams?: Record<string, unknown>): Promise<SignedTransaction> => {
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
      const pubkeys: Record<string, KitAddress> = {};
      if (ix.accounts !== undefined) for (const meta of ix.accounts) pubkeys[meta.address] = meta.address;
      return { instruction: ix, signers: [activeSigner], pubkeys };
    };

    result[ixName] = Object.assign(sendFn, {
      send: sendFn,
      instruction: instructionFn,
      transaction: transactionFn,
      simulate: simulateFn,
      prepare: prepareFn,
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

function buildTokenClient(
  rpc: KitRpc,
  signer: TransactionSigner | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  tokenProgramAddress: KitAddress,
): TokenClient {
  const deriveAtaAddr = async (owner: AddressInput, mint: AddressInput): Promise<KitAddress> => {
    const [ata] = await findAssociatedTokenPda({ owner: kitAddress(owner), tokenProgram: kitAddress(tokenProgramAddress), mint: kitAddress(mint) });
    return ata;
  };
  const sendFn = async (tx: SignedTransaction): Promise<Signature> => {
    return await sendAndConfirm(tx, rpc, commitment);
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
      const signedTx = await buildAndSignTransaction(instructions, rpc, activeSigner, commitment);
      const sig = await sendFn(signedTx);
      return { mint: mint.address, mintSigner: mint, signature: sig };
    },
    mintTo: async (params) => {
      const activeSigner = requireSigner(signer);
      const mint = kitAddress(params.mint);
      const owner = kitAddress(params.to);
      const ata = kitAddress(await deriveAtaAddr(params.to, params.mint));
      const decimals = params.decimals ?? await fetchMintDecimals(rpc, params.mint, tokenProgramAddress);
      const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: activeSigner, owner, mint, tokenProgram: kitAddress(tokenProgramAddress) });
      const mintIx = getMintToCheckedInstruction({ mint, token: ata, mintAuthority: activeSigner, amount: params.amount, decimals }, { programAddress: kitAddress(tokenProgramAddress) });
      const signedTx = await buildAndSignTransaction([createAtaIx, mintIx], rpc, activeSigner, commitment);
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
      const createDestinationIx = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: activeSigner, owner: kitAddress(params.to), mint, tokenProgram: kitAddress(tokenProgramAddress) });
      const transferIx = getTransferCheckedInstruction({ source, mint, destination, authority: activeSigner, amount: params.amount, decimals }, { programAddress: kitAddress(tokenProgramAddress) });
      const signedTx = await buildAndSignTransaction([createDestinationIx, transferIx], rpc, activeSigner, commitment);
      return await sendFn(signedTx);
    },
    getBalance: async (params) => {
      const ata = await deriveAtaAddr(params.owner, params.mint);
      const tokenAccount = await fetchMaybeToken(rpc, kitAddress(ata), { commitment });
      return tokenAccount.exists ? tokenAccount.data.amount : 0n;
    },
  };
}

type InstructionSigningMode = "signed" | "unsigned";

function buildInstruction(
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

async function buildAndSignTransaction(
  instructions: readonly Instruction[],
  rpc: KitRpc,
  signer: TransactionSigner,
  commitment: "processed" | "confirmed" | "finalized",
): Promise<SignedTransaction> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(signer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );
  return await signTransactionMessageWithSigners(message);
}

async function sendAndConfirm(
  transaction: SignedTransaction,
  rpc: KitRpc,
  _commitment: "processed" | "confirmed" | "finalized",
): Promise<Signature> {
  const signature = getSignatureFromTransaction(transaction);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: "base64" }).send();
  for (let attempt = 0; attempt < CONFIRMATION_RETRIES; attempt++) {
    const { value: statuses } = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send(); // oxlint-disable-line no-await-in-loop
    const status = statuses[0];
    if (status !== null && status !== undefined && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_INTERVAL_MS)); // oxlint-disable-line no-await-in-loop
  }
  throw new Error(`Transaction ${signature as unknown as string} not confirmed within ${CONFIRMATION_RETRIES * CONFIRMATION_INTERVAL_MS}ms`);
}

async function runSimulation(
  transaction: SignedTransaction,
  rpc: KitRpc,
  commitment: "processed" | "confirmed" | "finalized",
): Promise<SimulateResult> {
  const encoded = getBase64EncodedWireTransaction(transaction);
  const simResult = await rpc.simulateTransaction(encoded, { encoding: "base64", sigVerify: true, commitment }).send();
  if (simResult.value.err !== null && simResult.value.err !== undefined) {
    const errStr = typeof simResult.value.err === "string" ? simResult.value.err : JSON.stringify(simResult.value.err);
    const logs = simResult.value.logs?.join("\n") ?? "";
    throw new Error(`Transaction simulation failed: ${errStr}\nLogs:\n${logs}`);
  }
  const rd = simResult.value.returnData;
  return {
    logs: simResult.value.logs ?? [],
    unitsConsumed: BigInt(simResult.value.unitsConsumed ?? 0),
    returnData: rd !== null && rd !== undefined ? decodeBase64Data(rd.data) : null,
  };
}

function buildAccountMetas(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
  signer: TransactionSigner | undefined,
  mode: InstructionSigningMode,
): readonly (AccountMeta | AccountSignerMeta)[] {
  const accountMetas: (AccountMeta | AccountSignerMeta)[] = [];
  const accountEntries = Object.entries(ixDef.accounts);

  let omittedSignerCount = 0;
  for (const [name, input] of accountEntries) {
    if (input instanceof AccountConstraint && input.constraintKind === "signer" && params[name] === undefined) omittedSignerCount++;
  }
  if (omittedSignerCount > 1) {
    throw new Error("Multiple signer accounts omitted. Pass explicit addresses for all but one signer, or use sol.withSigner() for a different signer.");
  }

  for (const [name, input] of Object.entries(ixDef.accounts)) {
    if (input instanceof AccountConstraint && input.constraintKind === "remaining") {
      accountMetas.push(...remainingAccountMetas(name, params[name], input.remainingItem));
      continue;
    }
    accountMetas.push(resolveAccountMetaInput(name, input, params[name], signer, mode));
  }

  const hasInit = accountEntries.some(
    ([, input]) => input instanceof AccountConstraint && (input.constraintKind === "init" || input.constraintKind === "initIfNeeded"),
  );
  const alreadyHasSystemProgram = accountMetas.some((meta) => meta.address === SYSTEM_PROGRAM_ADDRESS);
  if (hasInit && !alreadyHasSystemProgram) {
    accountMetas.push({ address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY });
  }

  return accountMetas;
}

function resolveAccountMetaInput(
  name: string,
  input: AccountInputs[string],
  value: unknown,
  signer: TransactionSigner | undefined,
  mode: InstructionSigningMode,
): AccountMeta | AccountSignerMeta {
  if (!(input instanceof AccountConstraint)) {
    if (typeof value !== "string") throw new Error(`Missing account '${name}'`);
    return { address: kitAddress(value), role: AccountRole.READONLY };
  }

  const kind = input.constraintKind;
  const isWritable = kind === "init" || kind === "initIfNeeded" || kind === "close" || input.mutable;
  const role = accountRole(kind === "signer", isWritable);

  if (kind === "systemProgram") return fixedProgramMeta(name, value, SYSTEM_PROGRAM_ADDRESS, role);
  if (kind === "tokenProgram") return fixedProgramMeta(name, value, TOKEN_PROGRAM_ADDRESS, role);
  if (kind === "token2022Program") return fixedProgramMeta(name, value, TOKEN_2022_PROGRAM_ADDRESS, role);
  if (kind === "clock") return fixedProgramMeta(name, value, CLOCK_SYSVAR_ADDRESS, role);

  if (kind === "signer") return signerMeta(name, value, signer, isWritable, mode);
  if (typeof value !== "string") throw new Error(`Missing account '${name}'`);
  return { address: kitAddress(value), role };
}

function fixedProgramMeta(name: string, value: unknown, expected: KitAddress, role: AccountRole): AccountMeta {
  if (value !== undefined && (typeof value !== "string" || kitAddress(value) !== expected)) {
    throw new Error(`Account '${name}' must be ${expected}`);
  }
  return { address: expected, role };
}

function signerMeta(
  name: string,
  value: unknown,
  signer: TransactionSigner | undefined,
  isWritable: boolean,
  mode: InstructionSigningMode,
): AccountMeta | AccountSignerMeta {
  const role = isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  if (value === undefined) {
    if (signer === undefined) throw new Error(`Missing signer account '${name}'`);
    return { address: signer.address, role, signer };
  }
  if (typeof value !== "string") throw new Error(`Signer account '${name}' must be an address`);
  const accountAddress = kitAddress(value);
  if (signer !== undefined && accountAddress === signer.address) return { address: accountAddress, role, signer };
  if (mode === "signed") throw new Error(`Signer '${name}' must match the active signer. Use sol.withSigner() for another signer.`);
  return { address: accountAddress, role };
}

function remainingAccountMetas(name: string, value: unknown, item: unknown): readonly AccountMeta[] {
  if (!Array.isArray(value)) throw new Error(`Remaining account '${name}' must be an array of addresses`);
  const role = remainingAccountRole(item);
  return value.map((entry) => {
    if (typeof entry !== "string") throw new Error(`Remaining account '${name}' contains a non-address value`);
    return { address: kitAddress(entry), role };
  });
}

function remainingAccountRole(item: unknown): AccountRole {
  if (!(item instanceof AccountConstraint)) return AccountRole.READONLY;
  if (item.constraintKind === "signer") return item.mutable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  return item.mutable || item.constraintKind === "mut" || item.constraintKind === "init" || item.constraintKind === "initIfNeeded" || item.constraintKind === "close" || item.constraintKind === "realloc"
    ? AccountRole.WRITABLE
    : AccountRole.READONLY;
}

function accountRole(isSigner: boolean, isWritable: boolean): AccountRole.READONLY | AccountRole.WRITABLE | AccountRole.READONLY_SIGNER | AccountRole.WRITABLE_SIGNER {
  if (isSigner) return isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}

async function buildInstructionData(
  snakeName: string,
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  if (ixDef.args === undefined || Object.keys(ixDef.args).length === 0) return await anchorDiscriminator(snakeName);
  return await encodeInstruction(snakeName, ixDef.args, params);
}

async function fetchMintDecimals(rpc: KitRpc, mint: AddressInput, tokenProgramAddress: KitAddress): Promise<number> {
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

async function resolveSigner(signer: SignerInput | undefined): Promise<TransactionSigner> {
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

function isTransactionSignerInput(value: SignerInput): value is TransactionSigner {
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

function decodeBase64Data(data: readonly [string, string]): Uint8Array {
  const encoded = data[0];
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
