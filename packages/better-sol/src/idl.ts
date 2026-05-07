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

export type IdlType = IdlTypePrimitive | IdlTypeCompound;

export type IdlField = { readonly name: string; readonly type: IdlType };
export type IdlDiscriminator = readonly number[];

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

function idlTypeToToken(type: IdlType): TypeToken<unknown, TypeKind> {
  if (typeof type === "string") {
    const token = idlPrimitiveToToken(type);
    if (token === undefined) throw new Error(`Unknown IDL type: ${type}`);
    return token;
  }
  if ("option" in type && type.option !== undefined) return bs.optional(idlTypeToToken(type.option));
  if ("coption" in type && type.coption !== undefined) return bs.optional(idlTypeToToken(type.coption));
  if ("vec" in type && type.vec !== undefined) return bs.vector(idlTypeToToken(type.vec));
  if ("array" in type && type.array !== undefined) return bs.array(idlTypeToToken(type.array[0]), type.array[1]);
  if ("defined" in type) return bs.pubkey();
  throw new Error(`Unknown IDL type: ${JSON.stringify(type)}`);
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
    case "pubkey": case "publicKey": return bs.pubkey();
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
    buildInstructions(idl.instructions) as Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>>,
    buildAccounts(idl.accounts),
  ) as IdlProgram;
}

function buildErrors(errors: readonly IdlErrorDef[] | undefined): Record<string, string> {
  if (errors === undefined) return {};
  const result: Record<string, string> = {};
  for (const error of errors) {
    result[error.name] = error.msg ?? error.name;
  }
  return result;
}

function buildEvents(events: readonly { readonly name: string }[] | undefined): Record<string, FieldSchema> {
  if (events === undefined) return {};
  const result: Record<string, FieldSchema> = {};
  for (const event of events) {
    result[event.name] = {} as FieldSchema;
  }
  return result;
}

function buildInstructions(
  idlInstructions: readonly IdlInstructionDef[],
): Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> {
  const result: Record<string, InstructionDefinition<AccountInputs, ArgsSchema | undefined>> = {};
  for (const ix of idlInstructions) {
    const ixName = ix.name;
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
  if (idlAccounts === undefined || idlAccounts.length === 0) return {};
  const result: Record<string, AccountDefinition<FieldSchema, boolean, readonly string[]>> = {};
  for (const acc of idlAccounts) {
    const schema = fieldsToSchema(acc.type.fields);
    if (Object.keys(schema).length === 0) continue;
    result[acc.name] = bs.account(schema);
  }
  return result;
}
