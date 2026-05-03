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
  | "publicKey"
  | "string"
  | "bytes";

type IdlTypeCompound =
  | { readonly option: IdlType }
  | { readonly vec: IdlType }
  | { readonly array: readonly [IdlType, number] }
  | { readonly defined: string };

type IdlType = IdlTypePrimitive | IdlTypeCompound;

type IdlField = { readonly name: string; readonly type: IdlType };
type IdlAccountDef = { readonly name: string; readonly type: { readonly kind: "struct"; readonly fields: readonly IdlField[] } };
type IdlInstructionAccount = { readonly name: string; readonly writable: boolean; readonly signer: boolean };
type IdlInstructionArg = { readonly name: string; readonly type: IdlType };
type IdlInstructionDef = { readonly name: string; readonly accounts?: readonly IdlInstructionAccount[]; readonly args?: readonly IdlInstructionArg[] };
type IdlErrorDef = { readonly code: number; readonly name: string; readonly msg: string };

export type AnchorIdl = {
  readonly name: string;
  readonly instructions: readonly IdlInstructionDef[];
  readonly accounts?: readonly IdlAccountDef[];
  readonly errors?: readonly IdlErrorDef[];
  readonly metadata?: { readonly address?: string };
};

const PRIMITIVE_MAP: Record<IdlTypePrimitive, TypeToken<unknown, TypeKind>> = {
  u8, u16, u32, u64, u128,
  i8, i16, i32, i64, i128,
  f32, f64,
  bool,
  publicKey: pubkey,
  string,
  bytes,
};

function idlTypeToToken(type: IdlType): TypeToken<unknown, TypeKind> {
  if (typeof type === "string") {
    const token = PRIMITIVE_MAP[type];
    if (token === undefined) throw new Error(`Unknown IDL type: ${type}`);
    return token;
  }
  if ("option" in type) return optToken(idlTypeToToken(type.option));
  if ("vec" in type) return vecToken(idlTypeToToken(type.vec));
  if ("array" in type) return arrToken(idlTypeToToken(type.array[0]), type.array[1]);
  if ("defined" in type) return pubkey;
  throw new Error(`Unknown IDL type: ${JSON.stringify(type)}`);
}

function fieldsToSchema(fields: readonly IdlField[]): FieldSchema {
  const result: Record<string, TypeToken<unknown, TypeKind>> = {};
  for (const field of fields) {
    result[field.name] = idlTypeToToken(field.type);
  }
  return result as FieldSchema;
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
  return new ProgramDefinition(
    idl.name,
    idl.metadata?.address ?? "",
    buildErrors(idl.errors),
    {},
    buildInstructions(idl.instructions),
    buildAccounts(idl.accounts),
  ) as unknown as IdlProgram;
}

function buildErrors(errors: readonly IdlErrorDef[] | undefined): Record<string, string> {
  if (errors === undefined) return {} as Record<string, string>;
  const result: Record<string, string> = {};
  for (const error of errors) {
    result[error.name] = error.msg;
  }
  return result as Record<string, string>;
}

function buildInstructions(
  idlInstructions: readonly IdlInstructionDef[],
): Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> {
  const result: Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> = {} as Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>>;
  for (const ix of idlInstructions) {
    const accounts: Record<string, AccountConstraint<unknown, "signer" | "mut", boolean>> = {};
    for (const acc of ix.accounts ?? []) {
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

function buildAccounts(
  idlAccounts: readonly IdlAccountDef[] | undefined,
): Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>> {
  if (idlAccounts === undefined) return {} as Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>>;
  const result: Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>> = {} as Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>>;
  for (const acc of idlAccounts) {
    result[acc.name] = account(fieldsToSchema(acc.type.fields)) as AccountDefinition<FieldSchema, boolean, readonly string[]>;
  }
  return result;
}
