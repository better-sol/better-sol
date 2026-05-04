import {
  account,
  AccountConstraint,
  AccountDefinition,
  InstructionDefinition,
  array as arrToken,
  bool,
  bytes,
  f32,
  f64,
  i128,
  i16,
  i32,
  i64,
  i8,
  option as optToken,
  pubkey,
  string,
  u128,
  u16,
  u32,
  u64,
  u8,
  vec as vecToken,
  ProgramDefinition,
  type Address,
  type ArgsSchema,
  type FieldSchema,
  type TypeToken,
  type TypeKind,
  type AccountInputs,
} from "./program";

type IdlTypePrimitive =
  | "u8" | "u16" | "u32" | "u64" | "u128"
  | "i8" | "i16" | "i32" | "i64" | "i128"
  | "f32" | "f64"
  | "bool"
  | "publicKey" | "pubkey"
  | "string"
  | "bytes";

type IdlTypeCompound =
  | { readonly option: IdlType }
  | { readonly coption: IdlType }
  | { readonly vec: IdlType }
  | { readonly array: readonly [IdlType, number] }
  | { readonly defined: string | { readonly name: string } };

type IdlType = IdlTypePrimitive | IdlTypeCompound;

type IdlField = { readonly name: string; readonly type: IdlType };
type IdlDiscriminator = readonly number[];

type IdlInstructionAccount = {
  readonly name: string;
  readonly writable?: boolean;
  readonly signer?: boolean;
  readonly optional?: boolean;
  readonly address?: string;
  readonly pda?: { readonly seeds: readonly { readonly kind: string; readonly value?: readonly number[]; readonly path?: string }[] };
  readonly relations?: readonly string[];
};

type IdlInstructionAccounts = {
  readonly name: string;
  readonly accounts: readonly IdlInstructionAccount[];
};

type IdlInstructionAccountItem = IdlInstructionAccount | IdlInstructionAccounts;

type IdlInstructionArg = { readonly name: string; readonly type: IdlType };
type IdlInstructionDef = {
  readonly name: string;
  readonly discriminator?: IdlDiscriminator;
  readonly accounts?: readonly IdlInstructionAccountItem[];
  readonly args?: readonly IdlInstructionArg[];
  readonly returns?: IdlType;
};

type IdlAccountDef = {
  readonly name: string;
  readonly discriminator?: IdlDiscriminator;
  readonly type: { readonly kind: "struct"; readonly fields?: readonly IdlField[] };
};

type IdlErrorDef = { readonly code: number; readonly name: string; readonly msg?: string };

export type AnchorIdl = {
  readonly address?: string;
  readonly metadata?: { readonly name?: string; readonly address?: string };
  readonly name?: string;
  readonly instructions: readonly IdlInstructionDef[];
  readonly accounts?: readonly IdlAccountDef[];
  readonly events?: readonly { readonly name: string; readonly discriminator?: IdlDiscriminator }[];
  readonly errors?: readonly IdlErrorDef[];
  readonly types?: readonly { readonly name: string; readonly type: { readonly kind: string; readonly fields?: readonly IdlField[] } }[];
  readonly constants?: readonly { readonly name: string; readonly type: IdlType; readonly value: string }[];
};

const PRIMITIVE_MAP: Record<IdlTypePrimitive, TypeToken<unknown, TypeKind>> = {
  u8, u16, u32, u64, u128,
  i8, i16, i32, i64, i128,
  f32, f64,
  bool,
  pubkey, publicKey: pubkey,
  string,
  bytes,
};

function idlTypeToToken(type: IdlType): TypeToken<unknown, TypeKind> {
  if (typeof type === "string") {
    const token = PRIMITIVE_MAP[type];
    if (token === undefined) throw new Error(`Unknown IDL type: ${type}`);
    return token;
  }
  if ("option" in type && type.option !== undefined) return optToken(idlTypeToToken(type.option));
  if ("coption" in type && type.coption !== undefined) return optToken(idlTypeToToken(type.coption));
  if ("vec" in type && type.vec !== undefined) return vecToken(idlTypeToToken(type.vec));
  if ("array" in type && type.array !== undefined) return arrToken(idlTypeToToken(type.array[0]), type.array[1]);
  if ("defined" in type) return pubkey;
  throw new Error(`Unknown IDL type: ${JSON.stringify(type)}`);
}

function fieldsToSchema(fields: readonly IdlField[] | undefined): FieldSchema {
  if (fields === undefined || fields.length === 0) return {} as FieldSchema;
  const result: Record<string, TypeToken<unknown, TypeKind>> = {};
  for (const field of fields) {
    result[field.name] = idlTypeToToken(field.type);
  }
  return result as FieldSchema;
}

function normalizeName(name: string): string {
  return name;
}

export type IdlProgram = ProgramDefinition<
  string,
  Address,
  Record<string, string>,
  Record<string, FieldSchema>,
  Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>>,
  Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>>
>;

export function fromIdl(idl: AnchorIdl): IdlProgram {
  const programName = idl.metadata?.name ?? idl.name ?? "unknown";
  const programAddress = idl.address ?? idl.metadata?.address ?? "";
  return new ProgramDefinition(
    programName,
    programAddress,
    buildErrors(idl.errors),
    buildEvents(idl.events),
    buildInstructions(idl.instructions),
    buildAccounts(idl.accounts),
  ) as unknown as IdlProgram;
}

function buildErrors(errors: readonly IdlErrorDef[] | undefined): Record<string, string> {
  if (errors === undefined) return {} as Record<string, string>;
  const result: Record<string, string> = {};
  for (const error of errors) {
    result[normalizeName(error.name)] = error.msg ?? error.name;
  }
  return result as Record<string, string>;
}

function buildEvents(events: readonly { readonly name: string }[] | undefined): Record<string, FieldSchema> {
  if (events === undefined) return {} as Record<string, FieldSchema>;
  const result: Record<string, FieldSchema> = {};
  for (const event of events) {
    result[normalizeName(event.name)] = {} as FieldSchema;
  }
  return result as Record<string, FieldSchema>;
}

function buildInstructions(
  idlInstructions: readonly IdlInstructionDef[],
): Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> {
  const result: Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> = {} as Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>>;
  for (const ix of idlInstructions) {
    const ixName = normalizeName(ix.name);
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

    result[ixName] = new InstructionDefinition(
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
  idlAccounts: readonly IdlAccountDef[] | undefined,
): Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>> {
  if (idlAccounts === undefined || idlAccounts.length === 0) return {} as Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>>;
  const result: Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>> = {} as Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>>;
  for (const acc of idlAccounts) {
    const schema = fieldsToSchema(acc.type.fields);
    if (Object.keys(schema).length === 0) continue;
    result[normalizeName(acc.name)] = account(schema) as AccountDefinition<FieldSchema, boolean, readonly string[]>;
  }
  return result;
}
