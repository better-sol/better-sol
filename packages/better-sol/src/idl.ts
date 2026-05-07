import {
  bs,
  AccountConstraint,
  AccountDefinition,
  InstructionDefinition,
  ProgramDefinition,
  type Address,
  type ArgsSchema,
  type FieldSchema,
  type TypeToken,
  type TypeKind,
  type AccountInputs,
} from "#program";

// ── Anchor IDL type definitions ──
// These are structurally compatible with @coral-xyz/anchor's Idl type.
// Any valid Anchor Idl should be assignable to AnchorIdl.

export type IdlType =
  | IdlTypePrimitive
  | IdlTypeOption
  | IdlTypeCOption
  | IdlTypeVec
  | IdlTypeArray
  | IdlTypeDefined
  | IdlTypeGeneric;

type IdlTypePrimitive =
  | "bool" | "u8" | "i8" | "u16" | "i16" | "u32" | "i32"
  | "f32" | "u64" | "i64" | "f64" | "u128" | "i128"
  | "u256" | "i256"
  | "bytes" | "string" | "pubkey";

type IdlTypeOption = { readonly option: IdlType };
type IdlTypeCOption = { readonly coption: IdlType };
type IdlTypeVec = { readonly vec: IdlType };
type IdlTypeArray = { readonly array: readonly [IdlType, IdlArrayLen] };
type IdlTypeDefined = { readonly defined: { readonly name: string; readonly generics?: readonly IdlGenericArg[] } };
type IdlTypeGeneric = { readonly generic: string };

type IdlArrayLen = number | { readonly generic: string };

type IdlGenericArg =
  | { readonly kind: "type"; readonly type: IdlType }
  | { readonly kind: "const"; readonly value: string };

export type IdlField = { readonly name: string; readonly docs?: readonly string[]; readonly type: IdlType };

export type IdlDiscriminator = readonly number[];

export type IdlSeed =
  | { readonly kind: "const"; readonly value: readonly number[] }
  | { readonly kind: "arg"; readonly path: string }
  | { readonly kind: "account"; readonly path: string; readonly account?: string };

export type IdlPda = {
  readonly seeds: readonly IdlSeed[];
  readonly program?: IdlSeed;
};

export type IdlInstructionAccount = {
  readonly name: string;
  readonly docs?: readonly string[];
  readonly writable?: boolean;
  readonly signer?: boolean;
  readonly optional?: boolean;
  readonly address?: string;
  readonly pda?: IdlPda;
  readonly relations?: readonly string[];
};

export type IdlInstructionAccounts = {
  readonly name: string;
  readonly accounts: readonly IdlInstructionAccount[];
};

export type IdlInstructionAccountItem = IdlInstructionAccount | IdlInstructionAccounts;

export type IdlInstruction = {
  readonly name: string;
  readonly docs?: readonly string[];
  readonly discriminator?: IdlDiscriminator;
  readonly accounts?: readonly IdlInstructionAccountItem[];
  readonly args?: readonly IdlField[];
  readonly returns?: IdlType;
};

export type IdlAccount = {
  readonly name: string;
  readonly discriminator?: IdlDiscriminator;
};

export type IdlEvent = {
  readonly name: string;
  readonly discriminator?: IdlDiscriminator;
};

export type IdlErrorCode = {
  readonly name: string;
  readonly code: number;
  readonly msg?: string;
};

export type IdlTypeDefTy =
  | { readonly kind: "struct"; readonly fields?: IdlDefinedFields }
  | { readonly kind: "enum"; readonly variants: readonly IdlEnumVariant[] }
  | { readonly kind: "type"; readonly alias: IdlType };

export type IdlDefinedFields = readonly IdlField[] | readonly IdlType[];

export type IdlEnumVariant = {
  readonly name: string;
  readonly fields?: IdlDefinedFields;
};

export type IdlTypeDef = {
  readonly name: string;
  readonly docs?: readonly string[];
  readonly serialization?: unknown;
  readonly repr?: unknown;
  readonly generics?: readonly unknown[];
  readonly type: IdlTypeDefTy;
};

export type IdlMetadata = {
  readonly name?: string;
  readonly version?: string;
  readonly spec?: string;
  readonly description?: string;
  readonly repository?: string;
  readonly dependencies?: readonly { readonly name: string; readonly version: string }[];
  readonly contact?: string;
  readonly deployments?: { readonly mainnet?: string; readonly testnet?: string; readonly devnet?: string; readonly localnet?: string };
};

export type IdlConst = {
  readonly name: string;
  readonly type: IdlType;
  readonly value: string;
};

export type AnchorIdl = {
  readonly address?: string;
  readonly metadata?: IdlMetadata;
  readonly docs?: readonly string[];
  readonly name?: string;
  readonly instructions: readonly IdlInstruction[];
  readonly accounts?: readonly IdlAccount[];
  readonly events?: readonly IdlEvent[];
  readonly errors?: readonly IdlErrorCode[];
  readonly types?: readonly IdlTypeDef[];
  readonly constants?: readonly IdlConst[];
};

// ── Runtime helpers ──

function isNamedFields(fields: IdlDefinedFields | undefined): fields is readonly IdlField[] {
  if (fields === undefined) return false;
  if (fields.length === 0) return true;
  return typeof fields[0] === "object" && "name" in fields[0];
}

function getStructFields(typeDef: IdlTypeDef | undefined): readonly IdlField[] {
  if (typeDef === undefined) return [];
  if (typeDef.type.kind !== "struct") return [];
  if (!isNamedFields(typeDef.type.fields)) return [];
  return typeDef.type.fields;
}

function idlTypeToToken(type: IdlType): TypeToken<unknown, TypeKind> {
  if (typeof type === "string") {
    const token = idlPrimitiveToToken(type);
    if (token === undefined) throw new Error(`Unsupported IDL primitive type: ${type}`);
    return token;
  }
  if ("option" in type && type.option !== undefined) return bs.optional(idlTypeToToken(type.option));
  if ("coption" in type && type.coption !== undefined) return bs.optional(idlTypeToToken(type.coption));
  if ("vec" in type && type.vec !== undefined) return bs.vector(idlTypeToToken(type.vec));
  if ("array" in type && type.array !== undefined) {
    const [inner, size] = type.array;
    if (typeof size !== "number") throw new Error(`Generic array lengths are not supported: ${JSON.stringify(size)}`);
    return bs.array(idlTypeToToken(inner), size);
  }
  if ("defined" in type) return bs.pubkey();
  if ("generic" in type) throw new Error(`Generic types are not supported: ${type.generic}`);
  throw new Error(`Unknown IDL type: ${JSON.stringify(type)}`);
}

function idlPrimitiveToToken(type: IdlTypePrimitive): TypeToken<unknown, TypeKind> | undefined {
  switch (type) {
    case "u8": return bs.u8();
    case "u16": return bs.u16();
    case "u32": return bs.u32();
    case "u64": return bs.u64();
    case "u128": return bs.u128();
    case "u256": return bs.u128();
    case "i8": return bs.i8();
    case "i16": return bs.i16();
    case "i32": return bs.i32();
    case "i64": return bs.i64();
    case "i128": return bs.i128();
    case "i256": return bs.i128();
    case "f32": return bs.f32();
    case "f64": return bs.f64();
    case "bool": return bs.bool();
    case "pubkey": return bs.pubkey();
    case "string": return bs.string();
    case "bytes": return bs.bytes();
    default: return undefined;
  }
}

function fieldsToSchema(fields: readonly IdlField[] | undefined): FieldSchema {
  if (fields === undefined || fields.length === 0) return {};
  const result: Record<string, TypeToken<unknown, TypeKind>> = {};
  for (const field of fields) {
    result[field.name] = idlTypeToToken(field.type);
  }
  return result as FieldSchema;
}

// ── Public types ──

export type IdlProgram = ProgramDefinition<
  string,
  Address,
  Record<string, string>,
  Record<string, FieldSchema>,
  Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>>,
  Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>>
>;

type HasLiteralNames<T extends AnchorIdl> = string extends T["instructions"][number]["name"] ? false : true;

export function fromIdl<const T extends AnchorIdl>(idl: true extends HasLiteralNames<T> ? T : never): TypedIdlProgram<T>;
export function fromIdl(idl: AnchorIdl): IdlProgram;
export function fromIdl(idl: AnchorIdl): IdlProgram {
  const programName = idl.metadata?.name ?? idl.name ?? "unknown";
  const programAddress = idl.address ?? "";

  const typesByName = new Map<string, IdlTypeDef>();
  for (const t of idl.types ?? []) typesByName.set(t.name, t);

  return new ProgramDefinition(
    programName,
    programAddress,
    buildErrors(idl.errors),
    buildEvents(idl.events, typesByName),
    buildInstructions(idl.instructions) as Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>>,
    buildAccounts(idl.accounts, typesByName),
  ) as IdlProgram;
}

// ── Compile-time type helpers ──

type FlattenAccountItems<T extends readonly IdlInstructionAccountItem[]> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends IdlInstructionAccounts
      ? [...First["accounts"], ...FlattenAccountItems<Rest extends readonly IdlInstructionAccountItem[] ? Rest : readonly []>]
      : First extends IdlInstructionAccount
        ? [First, ...FlattenAccountItems<Rest extends readonly IdlInstructionAccountItem[] ? Rest : readonly []>]
        : readonly []
    : readonly [];

type IdlTypeToValue<T> =
  T extends "u8" | "u16" | "u32" | "i8" | "i16" | "i32" | "f32" | "f64" ? number :
  T extends "u64" | "u128" | "i64" | "i128" | "u256" | "i256" ? bigint :
  T extends "bool" ? boolean :
  T extends "pubkey" | "publicKey" ? Address :
  T extends "string" ? string :
  T extends "bytes" ? Uint8Array :
  T extends { readonly option: infer U } ? IdlTypeToValue<U> | null :
  T extends { readonly coption: infer U } ? IdlTypeToValue<U> | null :
  T extends { readonly vec: infer U } ? readonly IdlTypeToValue<U>[] :
  T extends { readonly array: readonly [infer U, unknown] } ? readonly IdlTypeToValue<U>[] :
  unknown;

type IdlArgsToRecord<TArgs extends readonly { readonly name: string; readonly type: unknown }[]> = {
  [K in TArgs[number] as K["name"]]: IdlTypeToValue<K["type"]>
};

type IdlAccountMeta = {
  readonly name: string;
  readonly writable?: boolean;
  readonly signer?: boolean;
  readonly optional?: boolean;
  readonly address?: string;
  readonly pda?: unknown;
};

type AccountRequiresInput<Acc extends IdlAccountMeta> =
  Acc["optional"] extends true ? false :
  Acc["address"] extends string ? false :
  Acc["pda"] extends object ? false :
  Acc["signer"] extends true ? false :
  true;

type IdlAccountsToRecord<TAccounts extends readonly IdlAccountMeta[]> = {
  [A in TAccounts[number] as AccountRequiresInput<A> extends true ? A["name"] : never]: Address
};

type IdlInstructionParams<T extends IdlInstruction> =
  IdlAccountsToRecord<FlattenAccountItems<T["accounts"] extends readonly IdlInstructionAccountItem[] ? T["accounts"] : readonly []>> &
  IdlArgsToRecord<T["args"] extends readonly { readonly name: string; readonly type: unknown }[] ? T["args"] : readonly []>;

export type TypedIdlParams<T extends AnchorIdl, TInstrName extends string> =
  IdlInstructionParams<Extract<T["instructions"][number], { readonly name: TInstrName }>>;

export type TypedIdlInstructionNames<T extends AnchorIdl> = T["instructions"][number]["name"];

export type TypedIdlAccountNames<T extends AnchorIdl> =
  T["accounts"] extends readonly { readonly name: infer N extends string }[] ? N : never;

export type TypedIdlErrorNames<T extends AnchorIdl> =
  T["errors"] extends readonly { readonly name: infer N extends string }[] ? N : string;

type TypedIdlInstructionsMap<T extends AnchorIdl> = {
  [K in T["instructions"][number] as K["name"]]: InstructionDefinition<AccountInputs, ArgsSchema | undefined>
};

type TypedIdlAccountsMap<T extends AnchorIdl> =
  T["accounts"] extends readonly { readonly name: string }[]
    ? { [K in T["accounts"][number] as K["name"]]: AccountDefinition<FieldSchema, boolean, readonly string[]> }
    : Record<never, never>;

export type TypedIdlProgram<T extends AnchorIdl> = ProgramDefinition<
  string,
  Address,
  T["errors"] extends readonly { readonly name: string; readonly msg?: string }[] ? { [E in T["errors"][number] as E["name"]]: E["msg"] extends string ? E["msg"] : E["name"] } : Record<string, string>,
  Record<string, FieldSchema>,
  TypedIdlInstructionsMap<T>,
  TypedIdlAccountsMap<T>
>;

// ── Build functions ──

function buildErrors(errors: readonly IdlErrorCode[] | undefined): Record<string, string> {
  if (errors === undefined) return {};
  const result: Record<string, string> = {};
  for (const error of errors) {
    result[error.name] = error.msg ?? error.name;
  }
  return result;
}

function buildEvents(events: readonly IdlEvent[] | undefined, typesByName: Map<string, IdlTypeDef>): Record<string, FieldSchema> {
  if (events === undefined) return {};
  const result: Record<string, FieldSchema> = {};
  for (const event of events) {
    const fields = getStructFields(typesByName.get(event.name));
    result[event.name] = fieldsToSchema(fields);
  }
  return result;
}

function buildInstructions(
  idlInstructions: readonly IdlInstruction[],
): Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> {
  const result: Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> = {};
  for (const ix of idlInstructions) {
    const flatAccounts = flattenAccountItems(ix.accounts);
    const accounts: Record<string, AccountConstraint<unknown, "signer" | "mut", boolean>> = {};
    for (const acc of flatAccounts) {
      if (acc.optional ?? false) continue;
      if (acc.writable && acc.signer) {
        accounts[acc.name] = new AccountConstraint("signer", true) as AccountConstraint<unknown, "signer" | "mut", boolean>;
      } else if (acc.signer) {
        accounts[acc.name] = new AccountConstraint("signer", false) as AccountConstraint<unknown, "signer" | "mut", boolean>;
      } else if (acc.writable) {
        accounts[acc.name] = new AccountConstraint("mut", true) as AccountConstraint<unknown, "signer" | "mut", boolean>;
      } else {
        accounts[acc.name] = new AccountConstraint("mut", false) as AccountConstraint<unknown, "signer" | "mut", boolean>;
      }
    }

    const args: Record<string, TypeToken<unknown, TypeKind>> = {};
    for (const arg of ix.args ?? []) {
      args[arg.name] = idlTypeToToken(arg.type);
    }

    result[ix.name] = new InstructionDefinition(
      accounts as AccountInputs,
      Object.keys(args).length > 0 ? (args as ArgsSchema) : undefined,
      () => {},
    );
  }
  return result;
}

function flattenAccountItems(items: readonly IdlInstructionAccountItem[] | undefined): readonly IdlInstructionAccount[] {
  if (items === undefined) return [];
  const result: IdlInstructionAccount[] = [];
  for (const item of items) {
    if ("accounts" in item) result.push(...item.accounts);
    else result.push(item);
  }
  return result;
}

function buildAccounts(
  idlAccounts: readonly IdlAccount[] | undefined,
  typesByName: Map<string, IdlTypeDef>,
): Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>> {
  if (idlAccounts === undefined || idlAccounts.length === 0) return {};
  const result: Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>> = {};
  for (const acc of idlAccounts) {
    const fields = getStructFields(typesByName.get(acc.name));
    const schema = fieldsToSchema(fields);
    if (Object.keys(schema).length === 0) continue;
    result[acc.name] = bs.account(schema);
  }
  return result;
}
