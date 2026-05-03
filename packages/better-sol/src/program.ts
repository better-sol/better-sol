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
  public max<const TNextMax extends number>(maxEntries: TNextMax): VecToken<TInner, TNextMax> {
    return new VecToken(this.inner, maxEntries);
  }
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

export const u8 = new PrimitiveToken<number, "u8">("u8");
export const u16 = new PrimitiveToken<number, "u16">("u16");
export const u32 = new PrimitiveToken<number, "u32">("u32");
export const u64 = new PrimitiveToken<bigint, "u64">("u64");
export const u128 = new PrimitiveToken<bigint, "u128">("u128");
export const i8 = new PrimitiveToken<number, "i8">("i8");
export const i16 = new PrimitiveToken<number, "i16">("i16");
export const i32 = new PrimitiveToken<number, "i32">("i32");
export const i64 = new PrimitiveToken<bigint, "i64">("i64");
export const i128 = new PrimitiveToken<bigint, "i128">("i128");
export const f32 = new PrimitiveToken<number, "f32">("f32");
export const f64 = new PrimitiveToken<number, "f64">("f64");
export const bool = new PrimitiveToken<boolean, "bool">("bool");
export const pubkey = new PrimitiveToken<Address, "pubkey">("pubkey");
export const string = new PrimitiveToken<string, "string">("string");
export const bytes = new PrimitiveToken<Uint8Array, "bytes">("bytes");

export function option<TInner extends TypeToken<unknown, TypeKind>>(inner: TInner): OptionToken<TInner> {
  return new OptionToken(inner);
}

export function vec<TInner extends TypeToken<unknown, TypeKind>>(inner: TInner): VecToken<TInner, 32> {
  return new VecToken(inner, 32);
}

export function array<TInner extends TypeToken<unknown, TypeKind>, const TSize extends number>(inner: TInner, size: TSize): ArrayToken<TInner, TSize> {
  return new ArrayToken(inner, size);
}

type NumericKind = "u8" | "u16" | "u32" | "u64" | "u128" | "i8" | "i16" | "i32" | "i64" | "i128";
type ZeroCopyPrimitiveKind = NumericKind | "f32" | "f64" | "bool" | "pubkey";
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
  return typeof seed === "string" ? seed : `{${seed.name}}`;
}

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
  ) {}

  public derive<const TNextSeeds extends readonly PdaSeedInput<TFields>[]>(buildSeeds: (seed: PdaSeedBuilder<TFields>) => TNextSeeds): AccountDefinition<TFields, TZeroCopy, readonly string[]> {
    const seedValues: readonly string[] = buildSeeds(createPdaSeedBuilder<TFields>()).map(normalizePdaSeed);
    return new AccountDefinition(this.fields, seedValues, this.zeroCopyEnabled);
  }

  public zeroCopy(this: AccountDefinition<ZeroCopyFields<TFields>, TZeroCopy, TSeeds>): AccountDefinition<TFields, true, TSeeds> {
    return new AccountDefinition(this.fields, this.seedValues, true);
  }
}

export type AccountData<TAccount> = TAccount extends AccountDefinition<infer TFields, boolean, readonly string[]> ? InferFields<TFields> : never;

export function account<const TFields extends FieldSchema>(fields: TFields): AccountDefinition<TFields, false, readonly []> {
  return new AccountDefinition(fields, [], false);
}

export function struct<const TFields extends FieldSchema>(fields: ZeroCopyFields<TFields>): StructZCDefinition<TFields> {
  return new StructZCDefinition(fields);
}

export type AccountDefs = Readonly<Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>>>;
export type ErrorMessages = Readonly<Record<string, string>>;
export type EventSchema = Readonly<Record<string, FieldSchema>>;

type AccountConstraintKind = "init" | "mut" | "close" | "signer" | "mint" | "tokenAccount" | "tokenProgram" | "token2022Program" | "systemProgram" | "clock" | "remaining";

export class AccountConstraint<TValue, TKind extends AccountConstraintKind, TMutable extends boolean = false> {
  public declare readonly [constraintValue]: TValue;
  public constructor(
    public readonly constraintKind: TKind,
    public readonly mutable: TMutable,
    public readonly accountDefinition: AccountDefinition<FieldSchema, boolean, readonly string[]> | undefined = undefined,
    public readonly refundTo: string | undefined = undefined,
    public readonly remainingItem: unknown = undefined,
  ) {}
}

export class MutableAccountConstraint<TValue, TKind extends AccountConstraintKind, TMutable extends boolean = false> extends AccountConstraint<TValue, TKind, TMutable> {
  public mut(): MutableAccountConstraint<TValue, TKind, true> {
    return new MutableAccountConstraint(this.constraintKind, true, this.accountDefinition, this.refundTo, this.remainingItem);
  }
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

type IxRunWithArgs<TAccounts extends AccountInputs, TArgs extends ArgsSchema, TErrors extends ErrorMessages, TEvents extends EventSchema> =
  (accounts: InferAccounts<TAccounts>, args: InferArgs<TArgs>, ctx: InstructionContext<TErrors, TEvents>) => void;

type IxRunWithoutArgs<TAccounts extends AccountInputs, TErrors extends ErrorMessages, TEvents extends EventSchema> =
  (accounts: InferAccounts<TAccounts>, ctx: InstructionContext<TErrors, TEvents>) => void;

type IxConfigWithArgs<TAccounts extends AccountInputs, TArgs extends ArgsSchema, TErrors extends ErrorMessages, TEvents extends EventSchema> = {
  readonly accounts: TAccounts;
  readonly args: TArgs;
  readonly run: IxRunWithArgs<TAccounts, TArgs, TErrors, TEvents>;
};

type IxConfigWithoutArgs<TAccounts extends AccountInputs, TErrors extends ErrorMessages, TEvents extends EventSchema> = {
  readonly accounts: TAccounts;
  readonly args?: undefined;
  readonly run: IxRunWithoutArgs<TAccounts, TErrors, TEvents>;
};

export class InstructionDefinition<TAccounts extends AccountInputs, TArgs extends ArgsSchema | undefined> {
  public constructor(
    public readonly accounts: TAccounts,
    public readonly args: TArgs,
    public readonly run: unknown,
  ) {}
}

type IxOverloads<TErrors extends ErrorMessages, TEvents extends EventSchema> = {
  <const TAccounts extends AccountInputs>(config: IxConfigWithoutArgs<TAccounts, TErrors, TEvents>): InstructionDefinition<TAccounts, undefined>;
  <const TAccounts extends AccountInputs, const TArgs extends ArgsSchema>(config: IxConfigWithArgs<TAccounts, TArgs, TErrors, TEvents>): InstructionDefinition<TAccounts, TArgs>;
};

function makeIx(): IxOverloads<ErrorMessages, EventSchema> {
  const fn = function ix<TAccounts extends AccountInputs, TArgs extends ArgsSchema | undefined>(
    config: IxConfigWithoutArgs<TAccounts, ErrorMessages, EventSchema> | IxConfigWithArgs<TAccounts, TArgs & ArgsSchema, ErrorMessages, EventSchema>,
  ): InstructionDefinition<TAccounts, TArgs | undefined> {
    return new InstructionDefinition(config.accounts, "args" in config ? config.args : undefined, config.run);
  };
  return fn as unknown as IxOverloads<ErrorMessages, EventSchema>;
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

export function program<
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

export const p = {
  create<TAccount extends AnyAccountDefinition>(accountDefinition: TAccount): AccountConstraint<AccountData<TAccount> & { key: Address }, "init", true> {
    return new AccountConstraint("init", true, accountDefinition);
  },
  mut<TAccount extends AnyAccountDefinition>(accountDefinition: TAccount): AccountConstraint<AccountData<TAccount> & { key: Address }, "mut", true> {
    return new AccountConstraint("mut", true, accountDefinition);
  },
  close<TAccount extends AnyAccountDefinition>(accountDefinition: TAccount, refundTo: string): AccountConstraint<AccountData<TAccount> & { key: Address }, "close", true> {
    return new AccountConstraint("close", true, accountDefinition, refundTo);
  },
  signer(): AccountConstraint<SignerInfo, "signer", false> {
    return new AccountConstraint("signer", false);
  },
  mint(): MutableAccountConstraint<MintAccount, "mint", false> {
    return new MutableAccountConstraint("mint", false);
  },
  tokenAccount(): MutableAccountConstraint<TokenAccountInfo, "tokenAccount", false> {
    return new MutableAccountConstraint("tokenAccount", false);
  },
  tokenProgram(): AccountConstraint<TokenProgramInfo, "tokenProgram", false> {
    return new AccountConstraint("tokenProgram", false);
  },
  token2022Program(): AccountConstraint<TokenProgramInfo, "token2022Program", false> {
    return new AccountConstraint("token2022Program", false);
  },
  systemProgram(): AccountConstraint<SystemProgramInfo, "systemProgram", false> {
    return new AccountConstraint("systemProgram", false);
  },
  clock(): AccountConstraint<ClockInfo, "clock", false> {
    return new AccountConstraint("clock", false);
  },
  remaining<TItem extends AccountInput>(item: TItem): AccountConstraint<RemainingAccounts<RemainingConstraintValue<TItem>>, "remaining", false> {
    return new AccountConstraint("remaining", false, undefined, undefined, item);
  },
} as const;

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

export const token = {
  transfer(_params: TransferParams): void {},
  transferChecked(_params: TransferCheckedParams): void {},
  mintTo(_params: MintToParams): void {},
  burn(_params: BurnParams): void {},
} as const;

export const sol = {
  timestamp(): bigint {
    return 0n;
  },
} as const;
