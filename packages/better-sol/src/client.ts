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
} from "@solana/kit";
import { flattenInstructionPlan } from "@solana/kit";
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
import { accountDiscriminator, anchorDiscriminator, decodeAccount, encodeField, encodeInstruction } from "./coder";
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

type AnyProgram = ProgramDefinition<string, Address, ErrorMessages, EventSchema, Instructions, AccountDefs>;
type ProgramInputs = Record<string, AnyProgram>;
type SignedTransaction = Awaited<ReturnType<typeof signTransactionMessageWithSigners>>;

type KitRpc = ReturnType<typeof createSolanaRpc>;
type KitRpcSubscriptions = ReturnType<typeof createSolanaRpcSubscriptions>;

export type SolSigner =
  | TransactionSigner
  | { readonly type: "secretKey"; readonly value: Uint8Array }
  | { readonly type: "file"; readonly path: string }
  | { readonly type: "generate" };

export function secretKey(bytes: Uint8Array): SolSigner {
  return { type: "secretKey", value: bytes };
}

export function keypairFile(path: string): SolSigner {
  return { type: "file", path };
}

export function generateSigner(): SolSigner {
  return { type: "generate" };
}

export function walletSigner(signer: TransactionSigner): TransactionSigner {
  return signer;
}

export type BetterSolConfig<TPrograms extends ProgramInputs = Record<string, never>> = {
  readonly cluster?: Cluster;
  readonly rpcUrl?: string;
  readonly rpcSubscriptionsUrl?: string;
  readonly payer?: SolSigner;
  readonly programs?: TPrograms;
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
  readonly size: number;
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
  createMint(params: { readonly decimals: number; readonly authority?: Address; readonly freezeAuthority?: Address | null }): Promise<{ readonly mint: Address; readonly signature: string }>;
  mintTo(params: { readonly mint: Address; readonly destination: Address; readonly amount: bigint; readonly decimals?: number }): Promise<string>;
  transfer(params: { readonly mint: Address; readonly to: Address; readonly amount: bigint; readonly from?: Address; readonly decimals?: number }): Promise<string>;
  getBalance(params: { readonly owner: Address; readonly mint: Address }): Promise<bigint>;
};

export type BetterSolClient<TPrograms extends ProgramInputs = Record<string, never>> = {
  readonly payer: Address;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly token: TokenClient;
  withSigner(signer: SolSigner): Promise<BetterSolClient<TPrograms>>;
  getBalance(address: Address): Promise<bigint>;
  transfer(params: { readonly to: Address; readonly amount: bigint }): Promise<string>;
} & {
  [K in keyof TPrograms]: TPrograms[K] extends AnyProgram ? ProgramClient<TPrograms[K]> : never;
};

class BoundAccountImpl<TFields extends FieldSchema, TSeeds extends readonly string[]> implements BoundAccount<TFields, TSeeds> {
  public constructor(
    private readonly definition: AccountDefinition<TFields, boolean, TSeeds>,
    private readonly programAddress: Address,
    private readonly rpc: KitRpc,
    private readonly accountName: string,
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
    const account = await fetchEncodedAccount(this.rpc, kitAddress(address));
    if (!account.exists || account.data.length === 0) return null;
    if (account.programAddress !== kitAddress(this.programAddress)) return null;
    const disc = await accountDiscriminator(this.accountName);
    if (!account.data.subarray(0, 8).every((b, i) => b === disc[i])) return null;
    return decodeAccount(this.definition.fields, new Uint8Array(account.data.subarray(8)));
  }

  public get size(): number {
    return 8 + Object.values(this.definition.fields as Record<string, TypeToken<unknown, TypeKind>>).reduce(
      (sum, token) => sum + borshSize(token),
      0,
    );
  }
}

export async function betterSol<const TPrograms extends ProgramInputs = Record<string, never>>(
  config: BetterSolConfig<TPrograms>,
): Promise<BetterSolClient<TPrograms>> {
  const cluster = config.cluster ?? "devnet";
  const rpcUrl = config.rpcUrl ?? CLUSTER_URLS[cluster];
  const rpcSubscriptionsUrl = config.rpcSubscriptionsUrl ?? CLUSTER_WS_URLS[cluster] ?? rpcUrlToWsUrl(rpcUrl);
  const rpc = createSolanaRpc(rpcUrl);
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl);
  const signer = await resolveSigner(config.payer);
  const programs = config.programs ?? {} as TPrograms;
  return buildClient({ config, programs, rpc, rpcSubscriptions, signer });
}

function buildClient<const TPrograms extends ProgramInputs>(params: {
  readonly config: BetterSolConfig<TPrograms>;
  readonly programs: TPrograms;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions;
  readonly signer: TransactionSigner;
}): BetterSolClient<TPrograms> {
  const client: Record<string, unknown> = {
    payer: params.signer.address,
    rpc: params.rpc,
    rpcSubscriptions: params.rpcSubscriptions,
    token: buildTokenClient(params.rpc, params.rpcSubscriptions, params.signer),
    withSigner: async (signerInput: SolSigner): Promise<BetterSolClient<TPrograms>> => {
      const nextSigner = await resolveSigner(signerInput);
      return buildClient({ ...params, signer: nextSigner });
    },
    getBalance: async (addressValue: Address): Promise<bigint> => {
      const { value } = await params.rpc.getBalance(kitAddress(addressValue)).send();
      return value;
    },
    transfer: async (transferParams: { readonly to: Address; readonly amount: bigint }): Promise<string> => {
      const ix = getTransferSolInstruction({
        source: params.signer,
        destination: kitAddress(transferParams.to),
        amount: transferParams.amount,
      });
      const signedTx = await buildAndSignTransaction([ix], params.rpc, params.signer);
      return await sendAndConfirm(signedTx, params.rpc);
    },
  };

  for (const [programName, programDef] of Object.entries(params.programs)) {
    client[programName] = buildProgramClient(
      programDef as AnyProgram,
      params.rpc,
      params.signer,
    );
  }

  return client as unknown as BetterSolClient<TPrograms>;
}

function buildProgramClient(
  program: AnyProgram,
  rpc: KitRpc,
  signer: TransactionSigner,
): Record<string, unknown> {
  const result: Record<string, unknown> = { address: program.address };

  for (const [ixName, ixDef] of Object.entries(program.instructions)) {
    const def = ixDef as InstructionDefinition<AccountInputs, ArgsSchema | undefined>;
    const snakeName = toSnake(ixName);
    const programId = program.address;

    const sendAndConfirmFn = async (params: Record<string, unknown>): Promise<string> => {
      const ix = await buildInstruction(def, params, programId, snakeName, signer);
      const signedTx = await buildAndSignTransaction([ix], rpc, signer);
      return await sendAndConfirm(signedTx, rpc);
    };

    const instructionFn = async (params: Record<string, unknown>): Promise<Instruction & InstructionWithSigners> => {
      return await buildInstruction(def, params, programId, snakeName, signer);
    };

    const transactionFn = async (params: Record<string, unknown>): Promise<SignedTransaction> => {
      const ix = await buildInstruction(def, params, programId, snakeName, signer);
      return await buildAndSignTransaction([ix], rpc, signer);
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
    );
  }
  result["accounts"] = accountNamespace;

  return result;
}

function buildTokenClient(
  rpc: KitRpc,
  rpcSubscriptions: KitRpcSubscriptions,
  signer: TransactionSigner,
): TokenClient {
  return {
    getATA: async (params) => await deriveAta(params.owner, params.mint),
    createMint: async (params) => {
      const mint = await resolveSigner(generateSigner());
      const plan = getCreateMintInstructionPlan({
        payer: signer,
        newMint: mint,
        decimals: params.decimals,
        mintAuthority: kitAddress(params.authority ?? signer.address),
        freezeAuthority: params.freezeAuthority === undefined ? null : params.freezeAuthority === null ? null : kitAddress(params.freezeAuthority),
      });
      const instructions = flattenInstructionPlan(plan).flatMap((leaf) => leaf.kind === "single" ? [leaf.instruction] : []);
      const signedTx = await buildAndSignTransaction(instructions, rpc, signer);
      const sig = await sendAndConfirm(signedTx, rpc);
      return { mint: mint.address, signature: sig };
    },
    mintTo: async (params) => {
      const mint = kitAddress(params.mint);
      const owner = kitAddress(params.destination);
      const ata = kitAddress(await deriveAta(params.destination, params.mint));
      const decimals = params.decimals ?? await fetchMintDecimals(rpc, params.mint);
      const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: signer, owner, mint });
      const mintIx = getMintToCheckedInstruction({ mint, token: ata, mintAuthority: signer, amount: params.amount, decimals });
      const signedTx = await buildAndSignTransaction([createAtaIx, mintIx], rpc, signer);
      return await sendAndConfirm(signedTx, rpc);
    },
    transfer: async (params) => {
      const mint = kitAddress(params.mint);
      const sourceOwner = params.from ?? signer.address;
      if (sourceOwner !== signer.address) throw new Error("Token transfer source must match the active signer. Use sol.withSigner() for another owner.");
      const source = kitAddress(await deriveAta(sourceOwner, params.mint));
      const destination = kitAddress(await deriveAta(params.to, params.mint));
      const decimals = params.decimals ?? await fetchMintDecimals(rpc, params.mint);
      const createDestinationIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
        payer: signer,
        owner: kitAddress(params.to),
        mint,
      });
      const transferIx = getTransferCheckedInstruction({
        source,
        mint,
        destination,
        authority: signer,
        amount: params.amount,
        decimals,
      });
      const signedTx = await buildAndSignTransaction([createDestinationIx, transferIx], rpc, signer);
      return await sendAndConfirm(signedTx, rpc);
    },
    getBalance: async (params) => {
      const ata = await deriveAta(params.owner, params.mint);
      const tokenAccount = await fetchMaybeToken(rpc, kitAddress(ata));
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
): Promise<SignedTransaction> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
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
): Promise<string> {
  const signature = getSignatureFromTransaction(transaction);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: "base64" }).send();

  for (let attempt = 0; attempt < CONFIRMATION_RETRIES; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const { value: statuses } = await rpc.getSignatureStatuses([signature]).send();
    const status = statuses[0];
    if (status !== null && status !== undefined && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      return signature;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_INTERVAL_MS));
  }
  throw new Error(`Transaction ${signature} not confirmed within ${CONFIRMATION_RETRIES * CONFIRMATION_INTERVAL_MS}ms`);
}

function buildAccountMetas(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
  signer: TransactionSigner,
): readonly (AccountMeta | AccountSignerMeta)[] {
  const accountMetas: (AccountMeta | AccountSignerMeta)[] = [];
  const argKeys = ixDef.args !== undefined ? new Set(Object.keys(ixDef.args)) : new Set<string>();

  let omittedSignerCount = 0;
  for (const [name, input] of Object.entries(ixDef.accounts)) {
    if (argKeys.has(name)) continue;
    if (input instanceof AccountConstraint && input.constraintKind === "signer" && params[name] === undefined) {
      omittedSignerCount++;
    }
  }
  if (omittedSignerCount > 1) {
    throw new Error("Multiple signer accounts omitted. Pass explicit addresses for all but one signer, or use sol.withSigner() for a different signer.");
  }

  for (const [name, input] of Object.entries(ixDef.accounts)) {
    if (argKeys.has(name)) continue;

    let isSigner = false;
    let isWritable = false;
    let accountAddress: KitAddress;

    if (input instanceof AccountConstraint) {
      const kind = input.constraintKind;
      isSigner = kind === "signer";
      isWritable = kind === "init" || kind === "mut" || kind === "close" || input.mutable;
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

async function deriveAta(owner: Address, mint: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({ owner: kitAddress(owner), tokenProgram: TOKEN_PROGRAM_ADDRESS, mint: kitAddress(mint) });
  return ata;
}

async function fetchMintDecimals(rpc: KitRpc, mint: Address): Promise<number> {
  const mintAccount = await fetchMaybeMint(rpc, kitAddress(mint));
  if (!mintAccount.exists) throw new Error(`Mint not found: ${mint}`);
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

async function resolveSigner(signer: SolSigner | undefined): Promise<TransactionSigner> {
  if (signer === undefined) return await createGeneratedSigner();
  if (isTransactionSignerInput(signer)) return signer;
  if (signer.type === "generate") return await createGeneratedSigner();
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

function rpcUrlToWsUrl(rpcUrl: string): string {
  if (rpcUrl.startsWith("https://")) return `wss://${rpcUrl.slice("https://".length)}`;
  if (rpcUrl.startsWith("http://")) return `ws://${rpcUrl.slice("http://".length)}`;
  return rpcUrl;
}

function toSnake(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function borshSize(token: TypeToken<unknown, TypeKind>): number {
  switch (token.kind) {
    case "u8": case "i8": case "bool": return 1;
    case "u16": case "i16": return 2;
    case "u32": case "i32": case "f32": return 4;
    case "u64": case "i64": case "f64": return 8;
    case "u128": case "i128": return 16;
    case "pubkey": return 32;
    case "string": case "bytes": return 64;
    case "option": case "vec": case "array": return 64;
    default: return 32;
  }
}
