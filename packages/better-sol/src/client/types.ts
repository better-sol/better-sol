import {
  type Address as KitAddress,
  type Rpc,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type SolanaRpcApi,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
  type TransactionSigner,
  type Signature as KitSignature,
  type Instruction as KitInstruction,
  type InstructionPlan as KitInstructionPlan,
  type Slot as KitSlot,
} from "@solana/kit";
import {
  type AccountConstraint,
  type AccountDefinition,
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
  type TypeToken,
} from "#program";

export type { Signature, Instruction } from "@solana/kit";
export type { WatchHandle } from "#client/watch-handle";

export type Cluster = "devnet" | "testnet" | "mainnet" | "localnet";

export const CLUSTER_URLS: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

export const CLUSTER_WS_URLS: Record<Cluster, string> = {
  devnet: "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  mainnet: "wss://api.mainnet.solana.com",
  localnet: "ws://127.0.0.1:8900",
};

export const CLOCK_SYSVAR_ADDRESS = "SysvarC1ock11111111111111111111111111111111" as KitAddress;
export const CONFIRMATION_RETRIES = 30;
export const CONFIRMATION_INTERVAL_MS = 1000;
export const TOKEN_2022_PROGRAM_ADDRESS = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as KitAddress;

export type AnyProgram = ProgramDefinition<string, ProgramAddress, ErrorMessages, EventSchema, Instructions, AccountDefs>;
export type ProgramInputs = Record<string, AnyProgram>;
export type KitRpc = Rpc<SolanaRpcApi & GetAccountInfoApi & GetMultipleAccountsApi>;
export type KitRpcSubscriptions = RpcSubscriptions<SolanaRpcSubscriptionsApi>;
export type AddressInput = string | KitAddress;
export type SignedTransaction = Awaited<ReturnType<typeof import("@solana/kit").signTransactionMessageWithSigners>>;

export type SecretKeySignerInput = { readonly type: "secretKey"; readonly value: Uint8Array };
export type KeypairFileSignerInput = { readonly type: "file"; readonly path: string };
export type SignerInput = TransactionSigner | SecretKeySignerInput | KeypairFileSignerInput;

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
  readonly rpc?: KitRpc;
  readonly rpcSubscriptions?: KitRpcSubscriptions;
  readonly payer?: SignerInput;
  readonly programs?: TPrograms;
  readonly commitment?: "processed" | "confirmed" | "finalized";
  readonly computeUnits?: ComputeUnitConfig;
  readonly addressLookupTables?: readonly KitAddress[];
  readonly durableNonce?: {
    readonly nonceAccountAddress: KitAddress;
    readonly nonceAuthority: TransactionSigner;
  };
};

export type StepChain<TOutputs extends readonly unknown[], TPrevious extends readonly unknown[] = readonly []> =
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

export type InstructionParams<TIx extends InstructionDefinition<AccountInputs, ArgsSchema | undefined>> =
  Prettify<
    (SafeRequiredKeys<TIx> extends never ? Record<never, never> : { [K in SafeRequiredKeys<TIx> & string]: AccountParamValue<IxAccountDefs<TIx>[K]> }) &
    (SafeOptionalKeys<TIx> extends never ? Record<never, never> : { [K in SafeOptionalKeys<TIx> & string]?: AccountParamValue<IxAccountDefs<TIx>[K]> }) &
    (SafeArgKeys<TIx> extends never ? Record<never, never> : { [K in SafeArgKeys<TIx> & string]: K extends keyof IxArgTypes<TIx> ? IxArgTypes<TIx>[K] : never })
  >;

export type SimulateResult = { readonly logs: readonly string[]; readonly unitsConsumed: bigint; readonly returnData: Uint8Array | null };

export type ComputeUnitConfig = {
  readonly computeUnitLimit?: bigint;
  readonly computeUnitPrice?: bigint;
};

export type PrepareResult = {
  readonly instruction: KitInstruction;
  readonly signers: readonly TransactionSigner[];
  readonly pubkeys: Record<string, KitAddress>;
};

export type InstructionPlanResult = {
  readonly instruction: KitInstruction;
  readonly plan: KitInstructionPlan;
};

export type InstructionSigningMode = "signed" | "unsigned";

export type InstructionMethod<TIx> = TIx extends InstructionDefinition<AccountInputs, ArgsSchema | undefined>
  ? RequiredKeys<InstructionParams<TIx>> extends never
    ? {
        (params?: InstructionParams<TIx>): Promise<KitSignature>;
        send(params?: InstructionParams<TIx>): Promise<KitSignature>;
        instruction(params?: InstructionParams<TIx>): Promise<KitInstruction>;
        transaction(params?: InstructionParams<TIx>): Promise<SignedTransaction>;
        simulate(params?: InstructionParams<TIx>): Promise<SimulateResult>;
        prepare(params?: InstructionParams<TIx>): Promise<PrepareResult>;
        plan(params?: InstructionParams<TIx>): Promise<InstructionPlanResult>;
      }
    : {
        (params: InstructionParams<TIx>): Promise<KitSignature>;
        send(params: InstructionParams<TIx>): Promise<KitSignature>;
        instruction(params: InstructionParams<TIx>): Promise<KitInstruction>;
        transaction(params: InstructionParams<TIx>): Promise<SignedTransaction>;
        simulate(params: InstructionParams<TIx>): Promise<SimulateResult>;
        prepare(params: InstructionParams<TIx>): Promise<PrepareResult>;
        plan(params: InstructionParams<TIx>): Promise<InstructionPlanResult>;
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

export type DeriveInput<TFields extends FieldSchema, TSeeds extends readonly string[]> = string extends TSeeds[number]
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

export type TokenClient = {
  getATA(params: { readonly owner: AddressInput; readonly mint: AddressInput }): Promise<KitAddress>;
  createMint(params: { readonly decimals: number; readonly authority?: AddressInput; readonly freezeAuthority?: AddressInput | null }): Promise<{ readonly mint: KitAddress; readonly mintSigner: TransactionSigner; readonly signature: KitSignature }>;
  mintTo(params: { readonly mint: AddressInput; readonly to: AddressInput; readonly amount: bigint; readonly decimals?: number }): Promise<KitSignature>;
  transfer(params: { readonly mint: AddressInput; readonly to: AddressInput; readonly amount: bigint; readonly decimals?: number }): Promise<KitSignature>;
  getBalance(params: { readonly owner: AddressInput; readonly mint: AddressInput }): Promise<bigint | null>;
};

export type EventCallback<TEvent extends Record<string, unknown> = Record<string, unknown>> = (event: TEvent, slot: bigint, signature: KitSignature) => void;

export type EventContext = {
  readonly slot: bigint;
  readonly signature: KitSignature;
};

export type TypedEvent<TEvents extends EventSchema> = {
  [K in keyof TEvents & string]: {
    readonly name: K;
    readonly data: InferFields<TEvents[K]>;
    readonly slot: bigint;
    readonly signature: KitSignature;
  };
}[keyof TEvents & string];

export type BetterSolClient<TPrograms extends ProgramInputs = Record<string, never>, THasSigner extends boolean = boolean> = {
  readonly payer: THasSigner extends true ? KitAddress : KitAddress | null;
  readonly rpc: KitRpc;
  readonly rpcSubscriptions: KitRpcSubscriptions | undefined;
  readonly token: TokenClient;
  readonly token2022: TokenClient;
  withSigner(signer: SignerInput): Promise<BetterSolClient<TPrograms, true>>;
  send(instructions: readonly (KitInstruction | Promise<KitInstruction>)[]): Promise<KitSignature>;
  batch(instructions: readonly (KitInstruction | Promise<KitInstruction>)[]): Promise<KitSignature>;
  steps<const TOutputs extends readonly unknown[]>(steps: StepChain<TOutputs>): Promise<TOutputs>;
  getBalance(address: AddressInput): Promise<bigint>;
  transfer(params: { readonly to: AddressInput; readonly amount: bigint }): Promise<KitSignature>;
  onTransaction(callback: (signature: KitSignature, result: KitSlot) => void): () => void;
} & {
  [K in keyof TPrograms]: TPrograms[K] extends AnyProgram ? ProgramClient<TPrograms[K]> : never;
};
