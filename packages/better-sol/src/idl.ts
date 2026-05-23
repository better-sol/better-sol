import { address as kitAddress, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { encodeField } from "#codec";
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
  type AccountResolutionContext,
  type AccountAddressResolver,
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

function idlTypeToToken(
  type: IdlType,
  typesByName: ReadonlyMap<string, IdlTypeDef>,
  visitedDefinedTypes: ReadonlySet<string> = new Set(),
): TypeToken<unknown, TypeKind> {
  if (typeof type === "string") {
    const token = idlPrimitiveToToken(type);
    if (token === undefined) throw new Error(`Unsupported IDL primitive type: ${type}`);
    return token;
  }
  if ("option" in type && type.option !== undefined) return bs.optional(idlTypeToToken(type.option, typesByName, visitedDefinedTypes));
  if ("coption" in type && type.coption !== undefined) return bs.optional(idlTypeToToken(type.coption, typesByName, visitedDefinedTypes));
  if ("vec" in type && type.vec !== undefined) return bs.vector(idlTypeToToken(type.vec, typesByName, visitedDefinedTypes));
  if ("array" in type && type.array !== undefined) {
    const [inner, size] = type.array;
    if (typeof size !== "number") throw new Error(`Generic array lengths are not supported: ${JSON.stringify(size)}`);
    return bs.array(idlTypeToToken(inner, typesByName, visitedDefinedTypes), size);
  }
  if ("defined" in type) return definedIdlTypeToToken(type.defined.name, typesByName, visitedDefinedTypes);
  if ("generic" in type) throw new Error(`Generic types are not supported: ${type.generic}`);
  throw new Error(`Unknown IDL type: ${JSON.stringify(type)}`);
}

function definedIdlTypeToToken(
  name: string,
  typesByName: ReadonlyMap<string, IdlTypeDef>,
  visitedDefinedTypes: ReadonlySet<string>,
): TypeToken<unknown, TypeKind> {
  if (visitedDefinedTypes.has(name)) throw new Error(`Recursive IDL type aliases are not supported: ${name}`);
  const typeDef = typesByName.get(name);
  if (typeDef === undefined) throw new Error(`Defined IDL type is missing from types array: ${name}`);
  if (typeDef.type.kind === "type") {
    const nextVisited = new Set(visitedDefinedTypes);
    nextVisited.add(name);
    return idlTypeToToken(typeDef.type.alias, typesByName, nextVisited);
  }
  if (typeDef.type.kind === "struct") throw new Error(`Defined struct IDL field types are not supported: ${name}`);
  throw new Error(`Defined enum IDL field types are not supported: ${name}`);
}

function idlPrimitiveToToken(type: IdlTypePrimitive): TypeToken<unknown, TypeKind> | undefined {
  switch (type) {
    case "u8": return bs.u8();
    case "u16": return bs.u16();
    case "u32": return bs.u32();
    case "u64": return bs.u64();
    case "u128": return bs.u128();
    case "i8": return bs.i8();
    case "i16": return bs.i16();
    case "i32": return bs.i32();
    case "i64": return bs.i64();
    case "i128": return bs.i128();
    case "f32": return bs.f32();
    case "f64": return bs.f64();
    case "bool": return bs.bool();
    case "pubkey": return bs.pubkey();
    case "string": return bs.string();
    case "bytes": return bs.bytes();
    default: return undefined;
  }
}

function fieldsToSchema(fields: readonly IdlField[] | undefined, typesByName: ReadonlyMap<string, IdlTypeDef>): FieldSchema {
  if (fields === undefined || fields.length === 0) return {};
  const result: Record<string, TypeToken<unknown, TypeKind>> = {};
  for (const field of fields) {
    result[field.name] = idlTypeToToken(field.type, typesByName);
  }
  return result as FieldSchema;
}

// ── Public types ──

export type IdlProgram = ProgramDefinition<
  string,
  Address,
  Record<string, { readonly message: string; readonly code: number }>,
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
    buildInstructions(idl.instructions, typesByName) as Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>>,
    buildAccounts(idl.accounts, typesByName),
    buildEventDiscriminators(idl.events),
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
  T extends "u64" | "u128" | "i64" | "i128" ? bigint :
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
  T["errors"] extends readonly { readonly name: string; readonly msg?: string; readonly code: number }[] ? { [E in T["errors"][number] as E["name"]]: { readonly message: E["msg"] extends string ? E["msg"] : E["name"]; readonly code: E["code"] } } : Record<string, { readonly message: string; readonly code: number }>,
  Record<string, FieldSchema>,
  TypedIdlInstructionsMap<T>,
  TypedIdlAccountsMap<T>
>;

// ── Build functions ──

function normalizeIdlDiscriminator(owner: string, discriminator: IdlDiscriminator | undefined): Uint8Array | undefined {
  if (discriminator === undefined) return undefined;
  if (discriminator.length !== 8) throw new Error(`${owner} discriminator must contain exactly 8 bytes`);
  return new Uint8Array(discriminator.map((byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error(`${owner} discriminator contains invalid byte: ${byte}`);
    return byte;
  }));
}

function buildEventDiscriminators(events: readonly IdlEvent[] | undefined): Record<string, Uint8Array> {
  if (events === undefined) return {};
  const result: Record<string, Uint8Array> = {};
  for (const event of events) {
    const discriminator = normalizeIdlDiscriminator(`Event '${event.name}'`, event.discriminator);
    if (discriminator !== undefined) result[event.name] = discriminator;
  }
  return result;
}

function buildErrors(errors: readonly IdlErrorCode[] | undefined): Record<string, { readonly message: string; readonly code: number }> {
  if (errors === undefined) return {};
  const result: Record<string, { readonly message: string; readonly code: number }> = {};
  for (const error of errors) {
    result[error.name] = { message: error.msg ?? error.name, code: error.code };
  }
  return result;
}

function buildEvents(events: readonly IdlEvent[] | undefined, typesByName: Map<string, IdlTypeDef>): Record<string, FieldSchema> {
  if (events === undefined) return {};
  const result: Record<string, FieldSchema> = {};
  for (const event of events) {
    const fields = getStructFields(typesByName.get(event.name));
    result[event.name] = fieldsToSchema(fields, typesByName);
  }
  return result;
}

function buildInstructions(
  idlInstructions: readonly IdlInstruction[],
  typesByName: ReadonlyMap<string, IdlTypeDef>,
): Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> {
  const result: Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> = {};
  for (const ix of idlInstructions) {
    const args: Record<string, TypeToken<unknown, TypeKind>> = {};
    for (const arg of ix.args ?? []) {
      args[arg.name] = idlTypeToToken(arg.type, typesByName);
    }

    const flatAccounts = flattenAccountItems(ix.accounts);
    const accounts: Record<string, AccountConstraint<unknown, "signer" | "mut", boolean>> = {};
    for (const acc of flatAccounts) {
      if (acc.optional ?? false) continue;
      accounts[acc.name] = createIdlAccountConstraint(acc, args);
    }

    result[ix.name] = new InstructionDefinition(
      accounts as AccountInputs,
      Object.keys(args).length > 0 ? (args as ArgsSchema) : undefined,
      () => {},
      undefined,
      normalizeIdlDiscriminator(`Instruction '${ix.name}'`, ix.discriminator),
    );
  }
  return result;
}

function createIdlAccountConstraint(
  account: IdlInstructionAccount,
  args: Readonly<Record<string, TypeToken<unknown, TypeKind>>>,
): AccountConstraint<unknown, "signer" | "mut", boolean> {
  const addressResolver = createIdlAccountAddressResolver(account, args);
  if (account.signer) return new AccountConstraint("signer", account.writable === true, undefined, undefined, undefined, undefined, addressResolver);
  return new AccountConstraint("mut", account.writable === true, undefined, undefined, undefined, undefined, addressResolver);
}

function createIdlAccountAddressResolver(
  account: IdlInstructionAccount,
  args: Readonly<Record<string, TypeToken<unknown, TypeKind>>>,
): AccountAddressResolver | undefined {
  const fixedAddress = account.address;
  if (fixedAddress !== undefined) return () => fixedAddress;
  const pda = account.pda;
  if (pda === undefined) return undefined;
  return async (context: AccountResolutionContext): Promise<Address> => {
    const programAddress = await resolvePdaProgramAddress(pda, context);
    const seeds = pda.seeds.map((seed) => resolvePdaSeedBytes(seed, args, context));
    const [derivedAddress] = await getProgramDerivedAddress({ programAddress: kitAddress(programAddress), seeds });
    return derivedAddress;
  };
}

async function resolvePdaProgramAddress(pda: IdlPda, context: AccountResolutionContext): Promise<Address> {
  if (pda.program === undefined) return context.programAddress;
  return resolvePdaSeedAddress(pda.program, context);
}

function resolvePdaSeedBytes(
  seed: IdlSeed,
  args: Readonly<Record<string, TypeToken<unknown, TypeKind>>>,
  context: AccountResolutionContext,
): Uint8Array {
  switch (seed.kind) {
    case "const": return new Uint8Array(seed.value);
    case "arg": return pdaValueToBytes(seed.path, resolvePath(context.params, seed.path), args[seed.path]);
    case "account": return pdaAddressToBytes(resolveAccountPath(seed.path, context));
  }
}

function resolvePdaSeedAddress(seed: IdlSeed, context: AccountResolutionContext): Address {
  switch (seed.kind) {
    case "const": return getAddressDecoder().decode(new Uint8Array(seed.value));
    case "arg": return resolveAddressValue(seed.path, resolvePath(context.params, seed.path));
    case "account": return resolveAccountPath(seed.path, context);
  }
}

function resolveAccountPath(path: string, context: AccountResolutionContext): Address {
  if (path in context.resolvedAccounts) return context.resolvedAccounts[path] ?? unreachablePath(path);
  const paramValue = resolvePath(context.params, path);
  if (paramValue !== undefined) return resolveAddressValue(path, paramValue);
  if (context.signerAddress !== undefined && (path === "signer" || path === "authority" || path === "user" || path === "payer")) return context.signerAddress;
  throw new Error(`Unable to resolve PDA account seed '${path}'`);
}

function pdaValueToBytes(path: string, value: unknown, token: TypeToken<unknown, TypeKind> | undefined): Uint8Array {
  if (token !== undefined) {
    if (token.kind === "pubkey") return pdaAddressToBytes(resolveAddressValue(path, value));
    if (isPdaNumericToken(token)) return encodeField(token, value);
  }
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (typeof value === "number") return encodeU64PdaSeed(BigInt(value));
  if (typeof value === "bigint") return encodeU64PdaSeed(value);
  if (value instanceof Uint8Array) return value;
  throw new Error(`Unable to encode PDA seed '${path}'`);
}

function isPdaNumericToken(token: TypeToken<unknown, TypeKind>): boolean {
  return token.kind === "u8" || token.kind === "u16" || token.kind === "u32" || token.kind === "u64" || token.kind === "u128" || token.kind === "i8" || token.kind === "i16" || token.kind === "i32" || token.kind === "i64" || token.kind === "i128";
}

function resolveAddressValue(path: string, value: unknown): Address {
  if (typeof value !== "string") throw new Error(`PDA seed '${path}' must be an address`);
  return kitAddress(value);
}

function pdaAddressToBytes(value: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(kitAddress(value)));
}

function encodeU64PdaSeed(value: bigint): Uint8Array {
  const buffer = new Uint8Array(8);
  for (let i = 0; i < 8; i++) buffer[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  return buffer;
}

function resolvePath(source: Readonly<Record<string, unknown>>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    return Reflect.get(current, part);
  }, source);
}

function unreachablePath(path: string): never {
  throw new Error(`Unable to resolve PDA account seed '${path}'`);
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
    const schema = fieldsToSchema(fields, typesByName);
    if (Object.keys(schema).length === 0) continue;
    result[acc.name] = new AccountDefinition(schema, [], false, [], normalizeIdlDiscriminator(`Account '${acc.name}'`, acc.discriminator));
  }
  return result;
}
