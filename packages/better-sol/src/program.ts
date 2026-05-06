const typeValue = Symbol("better-sol.typeValue");
const typeKind = Symbol("better-sol.typeKind");
const constraintValue = Symbol("better-sol.constraintValue");

export type Address = string;
export type PrimitiveKind = "u8" | "u16" | "u32" | "u64" | "u128" | "i8" | "i16" | "i32" | "i64" | "i128" | "f32" | "f64" | "bool" | "pubkey" | "string" | "bytes";
export type TypeKind = PrimitiveKind | "option" | "vec" | "array" | "struct_zc_ref";

export interface TypeToken<TValue, TKind extends TypeKind = TypeKind> {
  readonly kind: TKind;
  readonly [typeValue]: TValue;
  readonly [typeKind]: TKind;
}

export type InferType<TToken> = TToken extends TypeToken<infer TValue, TypeKind> ? TValue : never;
export type FieldSchema = Readonly<Record<string, TypeToken<unknown, TypeKind>>>;
export type InferFields<TFields extends FieldSchema> = {
  -readonly [K in keyof TFields]: InferType<TFields[K]>;
};

class PrimitiveToken<TValue, TKind extends PrimitiveKind> implements TypeToken<TValue, TKind> {
  public declare readonly [typeValue]: TValue;
  public declare readonly [typeKind]: TKind;
  public constructor(public readonly kind: TKind) {}
}

class OptionToken<TInner extends TypeToken<unknown, TypeKind>> implements TypeToken<InferType<TInner> | null, "option"> {
  public readonly kind = "option";
  public declare readonly [typeValue]: InferType<TInner> | null;
  public declare readonly [typeKind]: "option";
  public constructor(public readonly inner: TInner) {}
}

class VecToken<TInner extends TypeToken<unknown, TypeKind>, TMax extends number> implements TypeToken<BoundedArray<InferType<TInner>>, "vec"> {
  public readonly kind = "vec";
  public declare readonly [typeValue]: BoundedArray<InferType<TInner>>;
  public declare readonly [typeKind]: "vec";
  public constructor(public readonly inner: TInner, public readonly maxEntries: TMax) {}
}

class ArrayToken<TInner extends TypeToken<unknown, TypeKind>, TSize extends number> implements TypeToken<FixedArray<InferType<TInner>, TSize>, "array"> {
  public readonly kind = "array";
  public declare readonly [typeValue]: FixedArray<InferType<TInner>, TSize>;
  public declare readonly [typeKind]: "array";
  public constructor(public readonly inner: TInner, public readonly size: TSize) {}
}

export type FixedArray<TValue, TSize extends number> = {
  readonly length: TSize;
  [index: number]: TValue;
};

export type BoundedArray<TValue> = {
  readonly length: number;
  [index: number]: TValue;
};

export type RemainingAccounts<TValue> = {
  readonly length: number;
  [index: number]: TValue;
};

const u8Token = new PrimitiveToken<number, "u8">("u8");
const u16Token = new PrimitiveToken<number, "u16">("u16");
const u32Token = new PrimitiveToken<number, "u32">("u32");
const u64Token = new PrimitiveToken<bigint, "u64">("u64");
const u128Token = new PrimitiveToken<bigint, "u128">("u128");
const i8Token = new PrimitiveToken<number, "i8">("i8");
const i16Token = new PrimitiveToken<number, "i16">("i16");
const i32Token = new PrimitiveToken<number, "i32">("i32");
const i64Token = new PrimitiveToken<bigint, "i64">("i64");
const i128Token = new PrimitiveToken<bigint, "i128">("i128");
const f32Token = new PrimitiveToken<number, "f32">("f32");
const f64Token = new PrimitiveToken<number, "f64">("f64");
const boolToken = new PrimitiveToken<boolean, "bool">("bool");
const pubkeyToken = new PrimitiveToken<Address, "pubkey">("pubkey");
const stringToken = new PrimitiveToken<string, "string">("string");
const bytesToken = new PrimitiveToken<Uint8Array, "bytes">("bytes");

type NumericKind = "u8" | "u16" | "u32" | "u64" | "u128" | "i8" | "i16" | "i32" | "i64" | "i128";
type ZeroCopyPrimitiveKind = NumericKind | "f32" | "f64" | "pubkey";
type SeedableKind = NumericKind | "pubkey";
type ZeroCopyToken<TToken> =
  TToken extends TypeToken<unknown, infer TKind> ? TKind extends ZeroCopyPrimitiveKind | "struct_zc_ref" ? TToken :
    TToken extends ArrayToken<infer TInner, number> ? ZeroCopyToken<TInner> extends never ? never : TToken :
    never :
  never;
type ZeroCopyFields<TFields extends FieldSchema> = {
  readonly [K in keyof TFields]: ZeroCopyToken<TFields[K]>;
};
type SeedableKeys<TFields extends FieldSchema> = {
  [K in keyof TFields]: TFields[K] extends TypeToken<unknown, infer TKind> ? TKind extends SeedableKind ? K : never : never;
}[keyof TFields] & string;

type PdaSeedField<TName extends string> = {
  readonly kind: "field";
  readonly name: TName;
};

type PdaSeedBuilder<TFields extends FieldSchema> = {
  readonly [K in SeedableKeys<TFields>]: PdaSeedField<K>;
};

type PdaSeedInput<TFields extends FieldSchema> = string | PdaSeedBuilder<TFields>[SeedableKeys<TFields>];

function createPdaSeedBuilder<TFields extends FieldSchema>(): PdaSeedBuilder<TFields> {
  return new Proxy({}, {
    get(_target: object, property: string | symbol): PdaSeedField<string> | undefined {
      return typeof property === "string" ? { kind: "field", name: property } : undefined;
    },
  }) as PdaSeedBuilder<TFields>;
}

function normalizePdaSeed(seed: string | PdaSeedField<string>): string {
  if (typeof seed !== "string") return `{${seed.name}}`;
  if (/^\{[A-Za-z_$][\w$]*\}$/.test(seed)) throw new Error(`Dynamic PDA seed template '${seed}' is not supported. Store the value as an account field and reference it with seed.${seed.slice(1, -1)}.`);
  return seed;
}

type NormalizeSeed<T> = T extends PdaSeedField<infer K> ? `{${K}}` : T extends string ? T : never;
type NormalizeSeeds<T extends readonly unknown[]> = { [I in keyof T]: NormalizeSeed<T[I]> };

export class StructZCDefinition<TFields extends FieldSchema> implements TypeToken<InferFields<TFields>, "struct_zc_ref"> {
  public readonly kind = "struct_zc_ref";
  public declare readonly [typeValue]: InferFields<TFields>;
  public declare readonly [typeKind]: "struct_zc_ref";
  public constructor(public readonly fields: TFields) {}
}

export class AccountDefinition<TFields extends FieldSchema, TZeroCopy extends boolean = false, TSeeds extends readonly string[] = readonly []> {
  public constructor(
    public readonly fields: TFields,
    public readonly seedValues: TSeeds,
    public readonly zeroCopyEnabled: TZeroCopy,
    public readonly hasOneFields: readonly string[] = [],
  ) {}

  public derive<const TNextSeeds extends readonly PdaSeedInput<TFields>[]>(buildSeeds: (seed: PdaSeedBuilder<TFields>) => TNextSeeds): AccountDefinition<TFields, TZeroCopy, NormalizeSeeds<TNextSeeds>> {
    const seedValues: readonly string[] = buildSeeds(createPdaSeedBuilder<TFields>()).map(normalizePdaSeed);
    return new AccountDefinition(this.fields, seedValues, this.zeroCopyEnabled, this.hasOneFields) as AccountDefinition<TFields, TZeroCopy, NormalizeSeeds<TNextSeeds>>;
  }

  public zeroCopy(this: AccountDefinition<ZeroCopyFields<TFields>, TZeroCopy, TSeeds>): AccountDefinition<TFields, true, TSeeds> {
    return new AccountDefinition(this.fields, this.seedValues, true, this.hasOneFields);
  }

  public hasOne<const TField extends string>(field: TField): AccountDefinition<TFields, TZeroCopy, TSeeds> {
    return new AccountDefinition(this.fields, this.seedValues, this.zeroCopyEnabled, [...this.hasOneFields, field]);
  }
}

export type AccountData<TAccount> = TAccount extends AccountDefinition<infer TFields, boolean, readonly string[]> ? InferFields<TFields> : never;

export type AccountDefs = Readonly<Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>>>;
export type ErrorMessages = Readonly<Record<string, string>>;
export type EventSchema = Readonly<Record<string, FieldSchema>>;

type AccountConstraintKind = "init" | "initIfNeeded" | "mut" | "close" | "realloc" | "signer" | "mint" | "tokenAccount" | "tokenProgram" | "token2022Program" | "systemProgram" | "clock" | "remaining";

export class AccountConstraint<TValue, TKind extends AccountConstraintKind, TMutable extends boolean = false> {
  public declare readonly [constraintValue]: TValue;
  public constructor(
    public readonly constraintKind: TKind,
    public readonly mutable: TMutable,
    public readonly accountDefinition: AccountDefinition<FieldSchema, boolean, readonly string[]> | undefined = undefined,
    public readonly refundTo: string | undefined = undefined,
    public readonly remainingItem: unknown = undefined,
    public readonly reallocSpace: number | undefined = undefined,
  ) {}
}

export type MintAccount = {
  readonly key: Address;
  readonly supply: bigint;
  readonly decimals: number;
  readonly mintAuthority: Address | null;
  readonly freezeAuthority: Address | null;
};

export type TokenAccountInfo = {
  readonly key: Address;
  readonly mint: Address;
  readonly owner: Address;
  readonly amount: bigint;
};

export type TokenProgramInfo = { readonly key: Address };
export type SystemProgramInfo = { readonly key: Address };
export type ClockInfo = { readonly unixTimestamp: bigint; readonly slot: bigint; readonly epoch: bigint };
export type SignerInfo = Address;

export type AnyAccountDefinition = AccountDefinition<FieldSchema, boolean, readonly string[]>;
export type AnyConstraint = AccountConstraint<unknown, AccountConstraintKind, boolean>;
export type AccountInput = AnyAccountDefinition | AnyConstraint;
export type AccountInputs = Readonly<Record<string, AccountInput>>;
export type ArgsSchema = Readonly<Record<string, TypeToken<unknown, TypeKind>>>;

type ConstraintValue<TInput> =
  TInput extends AccountDefinition<FieldSchema, boolean, readonly string[]> ? Readonly<AccountData<TInput> & { readonly key: Address }> :
  TInput extends AccountConstraint<infer TValue, AccountConstraintKind, boolean> ? TValue :
  never;

type RemainingConstraintValue<TInput> =
  TInput extends AccountDefinition<FieldSchema, boolean, readonly string[]> ? AccountData<TInput> & { key: Address } :
  ConstraintValue<TInput>;

type InferAccounts<TAccounts extends AccountInputs> = {
  [K in keyof TAccounts]: ConstraintValue<TAccounts[K]>;
};

type InferArgs<TArgs extends ArgsSchema> = {
  [K in keyof TArgs]: InferType<TArgs[K]>;
};

export type InstructionContext<TErrors extends ErrorMessages = ErrorMessages, TEvents extends EventSchema = EventSchema> = {
  require(condition: boolean, errorName: keyof TErrors & string): void;
  emit<TName extends keyof TEvents & string>(name: TName, payload: InferFields<TEvents[TName]>): void;
  log(message: string, ...values: readonly (string | number | bigint | boolean | Address)[]): void;
};

type IxRunWithAccountsAndArgs<TAccounts extends AccountInputs, TArgs extends ArgsSchema, TErrors extends ErrorMessages, TEvents extends EventSchema> =
  (accounts: InferAccounts<TAccounts>, args: InferArgs<TArgs>, ctx: InstructionContext<TErrors, TEvents>) => void;

type IxRunWithAccounts<TAccounts extends AccountInputs, TErrors extends ErrorMessages, TEvents extends EventSchema> =
  (accounts: InferAccounts<TAccounts>, ctx: InstructionContext<TErrors, TEvents>) => void;

type IxRunWithArgs<TArgs extends ArgsSchema, TErrors extends ErrorMessages, TEvents extends EventSchema> =
  (args: InferArgs<TArgs>, ctx: InstructionContext<TErrors, TEvents>) => void;

type IxRunWithoutAccountsOrArgs<TErrors extends ErrorMessages, TEvents extends EventSchema> =
  (ctx: InstructionContext<TErrors, TEvents>) => void;

type IxReturns = { readonly returns?: TypeToken<unknown, TypeKind> };

type IxConfigWithAccountsAndArgs<TAccounts extends AccountInputs, TArgs extends ArgsSchema, TErrors extends ErrorMessages, TEvents extends EventSchema> = {
  readonly accounts: TAccounts;
  readonly args: TArgs;
  readonly run: IxRunWithAccountsAndArgs<TAccounts, TArgs, TErrors, TEvents>;
} & IxReturns;

type IxConfigWithAccounts<TAccounts extends AccountInputs, TErrors extends ErrorMessages, TEvents extends EventSchema> = {
  readonly accounts: TAccounts;
  readonly args?: undefined;
  readonly run: IxRunWithAccounts<TAccounts, TErrors, TEvents>;
} & IxReturns;

type IxConfigWithArgs<TArgs extends ArgsSchema, TErrors extends ErrorMessages, TEvents extends EventSchema> = {
  readonly accounts?: undefined;
  readonly args: TArgs;
  readonly run: IxRunWithArgs<TArgs, TErrors, TEvents>;
} & IxReturns;

type IxConfigWithoutAccountsOrArgs<TErrors extends ErrorMessages, TEvents extends EventSchema> = {
  readonly accounts?: undefined;
  readonly args?: undefined;
  readonly run: IxRunWithoutAccountsOrArgs<TErrors, TEvents>;
} & IxReturns;

type IxConfig<TAccounts extends AccountInputs, TArgs extends ArgsSchema | undefined, TErrors extends ErrorMessages, TEvents extends EventSchema> =
  | IxConfigWithAccountsAndArgs<TAccounts, TArgs & ArgsSchema, TErrors, TEvents>
  | IxConfigWithAccounts<TAccounts, TErrors, TEvents>
  | IxConfigWithArgs<TArgs & ArgsSchema, TErrors, TEvents>
  | IxConfigWithoutAccountsOrArgs<TErrors, TEvents>;

export class InstructionDefinition<TAccounts extends AccountInputs, TArgs extends ArgsSchema | undefined> {
  public constructor(
    public readonly accounts: TAccounts,
    public readonly args: TArgs,
    public readonly run: unknown,
    public readonly returns: TypeToken<unknown, TypeKind> | undefined = undefined,
  ) {}
}

type IxOverloads<TErrors extends ErrorMessages, TEvents extends EventSchema> = {
  <const TAccounts extends AccountInputs, const TArgs extends ArgsSchema>(config: IxConfigWithAccountsAndArgs<TAccounts, TArgs, TErrors, TEvents>): InstructionDefinition<TAccounts, TArgs>;
  <const TAccounts extends AccountInputs>(config: IxConfigWithAccounts<TAccounts, TErrors, TEvents>): InstructionDefinition<TAccounts, undefined>;
  <const TArgs extends ArgsSchema>(config: IxConfigWithArgs<TArgs, TErrors, TEvents>): InstructionDefinition<Record<never, never>, TArgs>;
  (config: IxConfigWithoutAccountsOrArgs<TErrors, TEvents>): InstructionDefinition<Record<never, never>, undefined>;
};

function makeIx(): IxOverloads<ErrorMessages, EventSchema> {
  const fn = function ix<TAccounts extends AccountInputs, TArgs extends ArgsSchema | undefined>(
    config: IxConfig<TAccounts, TArgs, ErrorMessages, EventSchema>,
  ): InstructionDefinition<TAccounts | Record<string, never>, TArgs | undefined> {
    const accounts = "accounts" in config && config.accounts !== undefined ? config.accounts : {};
    const args = "args" in config ? config.args : undefined;
    assertDistinctAccountAndArgNames(accounts, args);
    return new InstructionDefinition(accounts, args, config.run, config.returns);
  };
  return fn as unknown as IxOverloads<ErrorMessages, EventSchema>;
}

function assertDistinctAccountAndArgNames(accounts: AccountInputs, args: ArgsSchema | undefined): void {
  if (args === undefined) return;
  for (const name of Object.keys(accounts)) {
    if (name in args) throw new Error(`Instruction account '${name}' conflicts with an instruction arg of the same name. Rename one of them.`);
  }
}

type Instructions = Readonly<Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>>>;

export type { Instructions };

export type ProgramConfig<TName extends string, TAddress extends Address, TErrors extends ErrorMessages, TEvents extends EventSchema, TAccountDefs extends AccountDefs = AccountDefs> = {
  readonly name: TName;
  readonly address: TAddress;
  readonly accounts?: TAccountDefs;
  readonly errors?: TErrors;
  readonly events?: TEvents;
};

export class ProgramDefinition<TName extends string, TAddress extends Address, TErrors extends ErrorMessages, TEvents extends EventSchema, TInstructions extends Instructions, TAccountDefs extends AccountDefs = AccountDefs> {
  public constructor(
    public readonly name: TName,
    public readonly address: TAddress,
    public readonly errors: TErrors,
    public readonly events: TEvents,
    public readonly instructions: TInstructions,
    public readonly accounts: TAccountDefs = {} as TAccountDefs,
  ) {}
}

function createProgram<
  const TName extends string,
  const TAddress extends Address,
  const TErrors extends ErrorMessages,
  const TEvents extends EventSchema,
  const TInstructions extends Instructions,
  const TAccountDefs extends AccountDefs = AccountDefs,
>(
  config: ProgramConfig<TName, TAddress, TErrors, TEvents, TAccountDefs>,
  buildInstructions: (ix: IxOverloads<TErrors, TEvents>) => TInstructions,
): ProgramDefinition<TName, TAddress, TErrors, TEvents, TInstructions, TAccountDefs> {
  return new ProgramDefinition(
    config.name,
    config.address,
    config.errors ?? {} as TErrors,
    config.events ?? {} as TEvents,
    buildInstructions(makeIx() as unknown as IxOverloads<TErrors, TEvents>),
    (config.accounts ?? {}) as TAccountDefs,
  );
}

function createAccount<const TFields extends FieldSchema>(fields: TFields): AccountDefinition<TFields, false, readonly []> {
  return new AccountDefinition(fields, [], false);
}

function createStruct<const TFields extends FieldSchema>(fields: ZeroCopyFields<TFields>): StructZCDefinition<TFields> {
  return new StructZCDefinition(fields);
}

type TokenAuthority = Address | { readonly key: Address };

type TransferParams = {
  readonly from: TokenAccountInfo;
  readonly to: TokenAccountInfo;
  readonly authority: TokenAuthority;
  readonly amount: bigint;
};

type TransferCheckedParams = TransferParams & {
  readonly mint: MintAccount;
  readonly decimals: number;
};

type MintToParams = {
  readonly mint: MintAccount;
  readonly to: TokenAccountInfo;
  readonly authority: TokenAuthority;
  readonly amount: bigint;
};

type BurnParams = {
  readonly from: TokenAccountInfo;
  readonly mint: MintAccount;
  readonly authority: TokenAuthority;
  readonly amount: bigint;
};

class WritableBuilder<TValue, TKind extends AccountConstraintKind> extends AccountConstraint<TValue, TKind, false> {
  public constructor(kind: TKind) {
    super(kind, false);
  }
  public writable(): AccountConstraint<TValue, TKind, true> {
    return new AccountConstraint(this.constraintKind, true);
  }
}

export const bs = {
  u8: () => u8Token,
  u16: () => u16Token,
  u32: () => u32Token,
  u64: () => u64Token,
  u128: () => u128Token,
  i8: () => i8Token,
  i16: () => i16Token,
  i32: () => i32Token,
  i64: () => i64Token,
  i128: () => i128Token,
  f32: () => f32Token,
  f64: () => f64Token,
  bool: () => boolToken,
  pubkey: () => pubkeyToken,
  string: () => stringToken,
  bytes: () => bytesToken,

  optional: <TInner extends TypeToken<unknown, TypeKind>>(inner: TInner): OptionToken<TInner> => new OptionToken(inner),
  vector: <TInner extends TypeToken<unknown, TypeKind>>(inner: TInner, maxEntries?: number): VecToken<TInner, number> => new VecToken(inner, maxEntries ?? 32),
  array: <TInner extends TypeToken<unknown, TypeKind>, const TSize extends number>(inner: TInner, size: TSize): ArrayToken<TInner, TSize> => new ArrayToken(inner, size),

  account: createAccount,
  struct: createStruct,
  program: createProgram,

  init: <TAccount extends AnyAccountDefinition>(accountDefinition: TAccount): AccountConstraint<AccountData<TAccount> & { key: Address }, "init", true> => {
    return new AccountConstraint("init", true, accountDefinition);
  },
  initIfNeeded: <TAccount extends AnyAccountDefinition>(accountDefinition: TAccount): AccountConstraint<AccountData<TAccount> & { key: Address }, "initIfNeeded", true> => {
    return new AccountConstraint("initIfNeeded", true, accountDefinition);
  },
  mut: <TAccount extends AnyAccountDefinition>(accountDefinition: TAccount): AccountConstraint<AccountData<TAccount> & { key: Address }, "mut", true> => {
    return new AccountConstraint("mut", true, accountDefinition);
  },
  close: <TAccount extends AnyAccountDefinition>(accountDefinition: TAccount, refundTo: string): AccountConstraint<AccountData<TAccount> & { key: Address }, "close", true> => {
    return new AccountConstraint("close", true, accountDefinition, refundTo);
  },
  realloc: <TAccount extends AnyAccountDefinition>(accountDefinition: TAccount, space: number): AccountConstraint<AccountData<TAccount> & { key: Address }, "realloc", true> => {
    return new AccountConstraint("realloc", true, accountDefinition, undefined, undefined, space);
  },
  signer: (): AccountConstraint<SignerInfo, "signer", false> => {
    return new AccountConstraint("signer", false);
  },
  mint: (): WritableBuilder<MintAccount, "mint"> => new WritableBuilder("mint"),
  tokenAccount: (): WritableBuilder<TokenAccountInfo, "tokenAccount"> => new WritableBuilder("tokenAccount"),
  tokenProgram: (): AccountConstraint<TokenProgramInfo, "tokenProgram", false> => new AccountConstraint("tokenProgram", false),
  token2022Program: (): AccountConstraint<TokenProgramInfo, "token2022Program", false> => new AccountConstraint("token2022Program", false),
  systemProgram: (): AccountConstraint<SystemProgramInfo, "systemProgram", false> => new AccountConstraint("systemProgram", false),
  clock: (): AccountConstraint<ClockInfo, "clock", false> => new AccountConstraint("clock", false),
  remaining: <TItem extends AccountInput>(item: TItem): AccountConstraint<RemainingAccounts<RemainingConstraintValue<TItem>>, "remaining", false> => {
    return new AccountConstraint("remaining", false, undefined, undefined, item);
  },
} as const;

export type { bs as BsNamespace };

export function hasInnerToken(token: TypeToken<unknown, TypeKind>): token is TypeToken<unknown, TypeKind> & { readonly inner: TypeToken<unknown, TypeKind> } {
  return "inner" in token;
}

export function hasInnerAndSizeToken(token: TypeToken<unknown, TypeKind>): token is TypeToken<unknown, TypeKind> & { readonly inner: TypeToken<unknown, TypeKind>; readonly size: number } {
  return "inner" in token && "size" in token;
}

export function innerOfToken(token: TypeToken<unknown, TypeKind>): TypeToken<unknown, TypeKind> {
  if (!hasInnerToken(token)) throw new Error(`Token of kind '${token.kind}' has no inner`);
  return token.inner;
}

export function sizeOfToken(token: TypeToken<unknown, TypeKind>): number | undefined {
  if (!hasInnerAndSizeToken(token)) return undefined;
  return token.size;
}
export const cpi = {
  token: {
    transfer(_params: TransferParams): void {},
    transferChecked(_params: TransferCheckedParams): void {},
    mintTo(_params: MintToParams): void {},
    burn(_params: BurnParams): void {},
  },
  sol: {
    timestamp(): bigint { return 0n; },
  },
} as const;

export type InstructionAccounts<TInstruction> =
  TInstruction extends InstructionDefinition<infer TAccounts, ArgsSchema | undefined> ? InferAccounts<TAccounts> :
  never;

export type InstructionArgs<TInstruction> =
  TInstruction extends InstructionDefinition<AccountInputs, infer TArgs> ? TArgs extends ArgsSchema ? InferArgs<TArgs> : Record<never, never> :
  never;

export type ProgramInstructions<TProgram> =
  TProgram extends ProgramDefinition<string, Address, ErrorMessages, EventSchema, infer TInstructions, AccountDefs> ? TInstructions :
  never;

export type ProgramErrors<TProgram> =
  TProgram extends ProgramDefinition<string, Address, infer TErrors, EventSchema, Instructions, AccountDefs> ? TErrors :
  never;

export type ProgramEvents<TProgram> =
  TProgram extends ProgramDefinition<string, Address, ErrorMessages, infer TEvents, Instructions, AccountDefs> ? TEvents :
  never;

export type ProgramAccounts<TProgram> =
  TProgram extends ProgramDefinition<string, Address, ErrorMessages, EventSchema, Instructions, infer TAccountDefs> ? TAccountDefs :
  never;
