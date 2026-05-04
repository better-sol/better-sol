import type {
  IrAccount, IrError, IrEvent, IrInstruction, IrInstructionAccount, IrInstructionArg, IrProgram,
  IrStructZC, IrType,
} from "../ir/types";
import { CodeWriter } from "./code-writer";
import { toSnake, toPascal } from "../naming";
import { transpileBody } from "./body";

export function generateAnchorProject(program: IrProgram): AnchorProject {
  const libRs = generateLibRs(program);
  const cargoToml = generateCargoToml(program);
  const idl = generateIdl(program);

  return { libRs, cargoToml, idl, program };
}

type AnchorProject = {
  readonly libRs: string;
  readonly cargoToml: string;
  readonly idl: unknown;
  readonly program: IrProgram;
};

const ANCHOR_VERSION = "1.0.2";

function generateCargoToml(program: IrProgram): string {
  const usesToken2022 = program.instructions.some(hasToken2022Cpi);
  const usesToken = program.instructions.some((ix) => hasTokenCpi(ix) || usesTokenAccounts(ix)) || usesToken2022;

  const splEntry = usesToken
    ? buildSplDeps(usesToken2022)
    : "";
  const bytemuckEntry = program.accounts.some((account) => account.zeroCopy) || program.structsZC.length > 0
    ? "\nbytemuck = { version = \"=1.25.0\", features = [\"derive\"] }"
    : "";

  return `[package]
name = "${toSnake(program.name)}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
anchor-debug = []
custom-heap = []
custom-panic = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = { version = "=${ANCHOR_VERSION}", features = ["init-if-needed"] }${splEntry}${bytemuckEntry}
`;
}

function buildSplDeps(includeToken2022: boolean): string {
  const features = ["token", "associated_token"];
  if (includeToken2022) features.push("token_2022");
  return `\nanchor-spl = { version = "=${ANCHOR_VERSION}", features = [${features.map((feature) => `"${feature}"`).join(", ")}] }`;
}

function generateImports(usesToken: boolean, program: IrProgram): string {
  const imports = ["use anchor_lang::prelude::*;"];
  if (!usesToken) return imports.join("\n");

  const standardInstructions = program.instructions.filter((ix) => !hasToken2022Cpi(ix));
  const token2022Instructions = program.instructions.filter(hasToken2022Cpi);

  if (standardInstructions.some(usesTokenAccounts) || standardInstructions.some(hasTokenCpi)) {
    const types: string[] = [];
    if (standardInstructions.some((ix) => ix.accounts.some((account) => account.constraint.kind === "tokenProgram"))) types.push("Token");
    if (standardInstructions.some((ix) => ix.accounts.some((account) => account.constraint.kind === "tokenAccount"))) types.push("TokenAccount");
    if (standardInstructions.some((ix) => ix.accounts.some((account) => account.constraint.kind === "mint"))) types.push("Mint");
    const operations = collectTokenOperations(standardInstructions);
    if (operations.length > 0) types.unshift("self");
    for (const operation of operations) types.push(operation);
    imports.push(`use anchor_spl::token::{${types.join(", ")}};`);
  }

  if (token2022Instructions.length > 0) {
    const types = ["Mint as InterfaceMint", "TokenAccount as InterfaceTokenAccount", "TokenInterface"];
    const operations = collectTokenOperations(token2022Instructions);
    if (operations.length > 0) types.unshift("self");
    for (const operation of operations) types.push(operation);
    imports.push(`use anchor_spl::token_interface::{${types.join(", ")}};`);
  }

  return imports.join("\n");
}

function collectTokenOperations(instructions: readonly IrInstruction[]): readonly string[] {
  const operations = new Set<string>();
  for (const ix of instructions) {
    if (ix.body.includes("token.transferChecked")) operations.add("TransferChecked");
    if (ix.body.includes("token.transfer(")) operations.add("Transfer");
    if (ix.body.includes("token.mintTo")) operations.add("MintTo");
    if (ix.body.includes("token.burn")) operations.add("Burn");
  }
  return [...operations];
}

function usesTokenAccounts(ix: IrInstruction): boolean {
  return ix.accounts.some((account) => account.constraint.kind === "mint" || account.constraint.kind === "tokenAccount" || account.constraint.kind === "tokenProgram");
}

function generateErrors(errors: readonly IrError[]): string {
  const cw = new CodeWriter();
  cw.block(`#[error_code]\npub enum ProgramError`, () => {
    for (const error of errors) {
      cw.line(`#[msg("${error.message}")]`);
      cw.line(`${toPascal(error.name)},`);
    }
  });
  return cw.toString();
}

function generateEvent(event: IrEvent): string {
  const cw = new CodeWriter();
  cw.line("#[event]");
  cw.block(`pub struct ${toPascal(event.name)}`, () => {
    for (const field of event.fields) {
      cw.line(`pub ${toSnake(field.name)}: ${rustType(field.type)},`);
    }
  });
  return cw.toString();
}

function generateStructZC(szc: IrStructZC, structs: readonly IrStructZC[]): string {
  const cw = new CodeWriter();
  cw.line("#[derive(Default)]");
  cw.line("#[zero_copy]");
  cw.block(`pub struct ${toPascal(szc.name)}`, () => {
    for (const item of layoutRustFields(szc.fields, structs)) {
      cw.line(item);
    }
  });
  return cw.toString();
}

function generateAccount(account: IrAccount, structs: readonly IrStructZC[]): string {
  const cw = new CodeWriter();
  const attr = account.zeroCopy ? "#[account(zero_copy)]" : "#[account]";
  cw.line(attr);
  cw.block(`pub struct ${toPascal(account.name)}`, () => {
    const fields = account.zeroCopy ? layoutRustFields(account.fields, structs) : account.fields.map((field) => `pub ${toSnake(field.name)}: ${rustType(field.type, false)},`);
    for (const field of fields) cw.line(field);
  });
  return cw.toString();
}

function generateProgramModule(program: IrProgram): string {
  const cw = new CodeWriter();
  cw.line("#[program]");
  cw.block(`pub mod ${toSnake(program.name)}`, () => {
    cw.line("use super::*;");
    cw.blank();
    for (const ix of program.instructions) {
      cw.line(generateInstructionFn(ix, program).trimStart());
      cw.blank();
    }
  });
  return cw.toString();
}

function generateInstructionFn(ix: IrInstruction, program: IrProgram): string {
  const args = ix.args
    .map((a) => `${toSnake(a.name)}: ${rustType(a.type)}`)
    .join(", ");
  const argList = args.length > 0 ? `, ${args}` : "";
  const body = transpileBody(ix, program);
  const contextName = body.trim().length === 0 ? "_ctx" : "ctx";
  return `    pub fn ${toSnake(ix.name)}(${contextName}: Context<${toPascal(ix.name)}>${argList}) -> Result<()> {\n${body}        Ok(())\n    }`;
}

function generateAccountsStruct(ix: IrInstruction, accounts: readonly IrAccount[]): string {
  const ctxName = toPascal(ix.name);
  const hasArgs = ix.args.length > 0;

  const cw = new CodeWriter();
  cw.line("#[derive(Accounts)]");
  if (hasArgs) {
    const args = ix.args
      .map((a) => `${toSnake(a.name)}: ${rustType(a.type)}`)
      .join(", ");
    cw.line(`#[instruction(${args})]`);
  }
  cw.block(`pub struct ${ctxName}<'info>`, () => {
    for (const acc of ix.accounts) {
      if (acc.constraint.kind === "remaining") continue;
      const attrs = generateAccountAttrs(acc, accounts, ix.accounts, ix.args);
      for (const attr of attrs) cw.line(attr);
      cw.line(`pub ${toSnake(acc.name)}: ${resolveAccountsStructType(acc, accounts, ix)},`);
    }
    if (needsSystemProgram(ix)) cw.line("pub system_program: Program<'info, System>,");
  });
  return cw.toString();
}

function generateAccountAttrs(
  acc: IrInstructionAccount,
  accounts: readonly IrAccount[],
  ixAccounts: readonly IrInstructionAccount[],
  ixArgs: readonly IrInstructionArg[],
): readonly string[] {
  const c = acc.constraint;
  const lines: string[] = [];

  switch (c.kind) {
    case "init":
    case "initIfNeeded": {
      const initKind = c.kind === "initIfNeeded" ? "init_if_needed" : "init";
      const accountDef = findAccountDef(c.accountName, accounts);
      const space = accountDef?.space ?? (8 + 32);
      const seeds = accountDef !== undefined ? formatSeedsForAttr(accountDef, accounts, ixAccounts, ixArgs, acc.name) : undefined;
      const payer = findPayer(acc, ixAccounts);

      lines.push("#[account(");
      lines.push(`    ${initKind},`);
      lines.push(`    payer = ${toSnake(payer)},`);
      lines.push(`    space = ${space},`);
      if (seeds !== undefined) {
        lines.push(`    seeds = [${seeds}],`);
        lines.push("    bump");
      }
      lines.push(")]");
      break;
    }
    case "mut": {
      const accountDef = findAccountDef(c.accountName, accounts);
      const seeds = accountDef !== undefined ? formatSeedsForAttr(accountDef, accounts, ixAccounts, ixArgs, acc.name) : undefined;
      if (seeds !== undefined) {
        lines.push("#[account(");
        lines.push("    mut,");
        lines.push(`    seeds = [${seeds}],`);
        lines.push("    bump");
        lines.push(")]");
      } else {
        lines.push("#[account(mut)]");
      }
      break;
    }
    case "close":
      lines.push(`#[account(mut, close = ${toSnake(c.refundTo)})]`);
      break;
    case "signer":
      lines.push("#[account(mut)]");
      break;
    case "mint":
      if (c.mutable) lines.push("#[account(mut)]");
      break;
    case "tokenAccount":
      if (c.mutable) lines.push("#[account(mut)]");
      break;
    case "bare": {
      const accountDef = findAccountDef(c.accountName, accounts);
      const seeds = accountDef !== undefined ? formatSeedsForAttr(accountDef, accounts, ixAccounts, ixArgs, acc.name) : undefined;
      if (seeds !== undefined) {
        lines.push("#[account(");
        lines.push(`    seeds = [${seeds}],`);
        lines.push("    bump");
        lines.push(")]");
      }
      break;
    }
  }

  return lines;
}

function resolveAccountsStructType(acc: IrInstructionAccount, accounts: readonly IrAccount[], ix: IrInstruction): string {
  const c = acc.constraint;

  const usesToken2022 = ix.accounts.some((account) => account.constraint.kind === "token2022Program");

  if (c.kind === "signer") return "Signer<'info>";
  if (c.kind === "mint") return usesToken2022 ? "InterfaceAccount<'info, InterfaceMint>" : "Account<'info, Mint>";
  if (c.kind === "tokenAccount") return usesToken2022 ? "InterfaceAccount<'info, InterfaceTokenAccount>" : "Account<'info, TokenAccount>";
  if (c.kind === "tokenProgram") return "Program<'info, Token>";
  if (c.kind === "token2022Program") return "Interface<'info, TokenInterface>";
  if (c.kind === "systemProgram") return "Program<'info, System>";
  if (c.kind === "clock") return "Sysvar<'info, Clock>";
  if (c.kind === "remaining") return "/* remaining_accounts */";

  const accountName = c.kind === "init" || c.kind === "initIfNeeded" || c.kind === "mut" || c.kind === "close" || c.kind === "bare"
    ? c.accountName
    : acc.name;

  const accountDef = findAccountDef(accountName, accounts);
  if (accountDef !== undefined) {
    if (accountDef.zeroCopy) return `AccountLoader<'info, ${toPascal(accountDef.name)}>`;
    return `Account<'info, ${toPascal(accountDef.name)}>`;
  }

  if (c.kind === "init" || c.kind === "initIfNeeded" || c.kind === "mut" || c.kind === "close") return "Signer<'info>";

  return "Account<'info, AccountInfo>";
}

function findAccountDef(name: string, accounts: readonly IrAccount[]): IrAccount | undefined {
  const normalized = name.toLowerCase();
  return accounts.find(
    (a) => a.name.toLowerCase() === normalized || toPascal(a.name).toLowerCase() === normalized,
  );
}

function findPayer(_current: IrInstructionAccount, allAccounts: readonly IrInstructionAccount[]): string {
  const signer = allAccounts.find((acc) => acc.constraint.kind === "signer");
  return signer !== undefined ? toSnake(signer.name) : "authority";
}

function needsSystemProgram(ix: IrInstruction): boolean {
  const hasInit = ix.accounts.some((acc) => acc.constraint.kind === "init" || acc.constraint.kind === "initIfNeeded");
  const hasSystemProgram = ix.accounts.some((acc) => acc.constraint.kind === "systemProgram");
  return hasInit && !hasSystemProgram;
}

function isMutable(acc: IrInstructionAccount): boolean {
  const c = acc.constraint;
  return c.kind === "mut" || c.kind === "init" || c.kind === "initIfNeeded" || c.kind === "close" ||
    (c.kind === "tokenAccount" && c.mutable) ||
    (c.kind === "mint" && c.mutable);
}

function hasTokenCpi(ix: IrInstruction): boolean {
  return ix.body.includes("token.") || ix.body.includes("system.");
}

function hasToken2022Cpi(ix: IrInstruction): boolean {
  return ix.accounts.some((acc) => acc.constraint.kind === "token2022Program");
}

function formatSeedsForAttr(
  account: IrAccount,
  _accounts: readonly IrAccount[],
  ixAccounts: readonly IrInstructionAccount[],
  ixArgs: readonly IrInstructionArg[],
  currentAccountName: string,
): string | undefined {
  if (account.seeds.length === 0) return undefined;
  const currentIxAccount = ixAccounts.find((candidate) => candidate.name === currentAccountName);
  return account.seeds.map((seed) => {
    if (seed.kind === "literal") return `b"${seed.value}"`;

    const field = account.fields.find((candidate) => candidate.name === seed.fieldName);
    if (field === undefined) {
      throw new Error(`Unknown PDA seed field '${seed.fieldName}' for account '${account.name}'. Use .derive((seed) => ['literal', seed.fieldName]) with a pubkey or integer field on the account.`);
    }

    if (currentIxAccount?.constraint.kind === "init" || currentIxAccount?.constraint.kind === "initIfNeeded") {
      const arg = ixArgs.find((candidate) => candidate.name === seed.fieldName);
      if (arg !== undefined) return formatSeedBytes(toSnake(arg.name), arg.type);

      const ixAccount = ixAccounts.find((candidate) => candidate.name === seed.fieldName);
      if (ixAccount !== undefined) return `${toSnake(ixAccount.name)}.key().as_ref()`;

      throw new Error(`PDA seed field '${seed.fieldName}' for initialized account '${account.name}' must be provided by an instruction arg or account with the same name.`);
    }

    const fieldName = account.zeroCopy
      ? `${toSnake(currentAccountName)}.load()?.${toSnake(seed.fieldName)}`
      : `${toSnake(currentAccountName)}.${toSnake(seed.fieldName)}`;
    return formatSeedBytes(fieldName, field.type);
  }).join(", ");
}

function formatSeedBytes(expression: string, type: IrType): string {
  if (type === "pubkey") return `${expression}.as_ref()`;
  if (isIntegerType(type)) return `${expression}.to_le_bytes().as_ref()`;
  throw new Error(`Unsupported PDA seed type '${formatSeedType(type)}'. PDA field seeds must be pubkey or integer values.`);
}

function isIntegerType(type: IrType): boolean {
  return typeof type === "string" && ["u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128"].includes(type);
}

function formatSeedType(type: IrType): string {
  if (typeof type === "string") return type;
  return type.kind;
}

function generateIdl(program: IrProgram): unknown {
  return {
    version: "0.1.0",
    name: program.name,
    address: program.address,
    metadata: { name: program.name, version: "0.1.0" },
    instructions: program.instructions.map((ix) => ({
      name: toSnake(ix.name),
      accounts: ix.accounts
        .filter((acc) => acc.constraint.kind !== "remaining")
        .map((acc) => ({
          name: toSnake(acc.name),
          isMut: isMutable(acc),
          isSigner: acc.constraint.kind === "signer",
        })),
      args: ix.args.map((arg) => ({
        name: toSnake(arg.name),
        type: idlType(arg.type),
      })),
    })),
    accounts: program.accounts
      .filter((a) => a.name !== "Config" && a.name !== "Event")
      .map((a) => ({
        name: toSnake(a.name),
        type: {
          kind: "struct",
          fields: a.fields.map((f) => ({
            name: toSnake(f.name),
            type: idlType(f.type),
          })),
        },
      })),
    errors: program.errors.map((e, i) => ({
      code: 6000 + i,
      name: toPascal(e.name),
      msg: e.message,
    })),
    events: program.events.map((e) => ({
      name: toPascal(e.name),
      fields: e.fields.map((f) => ({
        name: toSnake(f.name),
        type: idlType(f.type),
        index: false,
      })),
    })),
  };
}

function layoutRustFields(fields: readonly { readonly name: string; readonly type: IrType }[], structs: readonly IrStructZC[]): readonly string[] {
  const lines: string[] = [];
  let offset = 0;
  let maxAlign = 1;
  let paddingIndex = 0;

  for (const field of fields) {
    const layout = typeLayout(field.type, structs, true);
    const padding = paddingFor(offset, layout.align);
    if (padding > 0) {
      lines.push(`pub _padding_${paddingIndex}: [u8; ${padding}],`);
      paddingIndex++;
      offset += padding;
    }
    lines.push(`pub ${toSnake(field.name)}: ${rustType(field.type, true)},`);
    offset += layout.size;
    maxAlign = Math.max(maxAlign, layout.align);
  }

  const tailPadding = paddingFor(offset, maxAlign);
  if (tailPadding > 0) lines.push(`pub _padding_${paddingIndex}: [u8; ${tailPadding}],`);
  return lines;
}

function paddingFor(offset: number, align: number): number {
  const remainder = offset % align;
  return remainder === 0 ? 0 : align - remainder;
}

function typeLayout(type: IrType, structs: readonly IrStructZC[], zeroCopy: boolean): { readonly size: number; readonly align: number } {
  if (typeof type === "string") return primitiveLayout(type, zeroCopy);
  if (type.kind === "array") {
    const inner = typeLayout(type.inner, structs, zeroCopy);
    return { size: inner.size * type.size, align: inner.align };
  }
  if (type.kind === "struct_zc_ref") {
    const struct = structs.find((candidate) => candidate.name === type.name);
    if (struct === undefined) throw new Error(`Unknown zero-copy struct '${type.name}'`);
    return structLayout(struct.fields, structs);
  }
  throw new Error(`Unsupported zero-copy type '${type.kind}'`);
}

function structLayout(fields: readonly { readonly type: IrType }[], structs: readonly IrStructZC[]): { readonly size: number; readonly align: number } {
  let offset = 0;
  let maxAlign = 1;
  for (const field of fields) {
    const layout = typeLayout(field.type, structs, true);
    offset += paddingFor(offset, layout.align) + layout.size;
    maxAlign = Math.max(maxAlign, layout.align);
  }
  return { size: offset + paddingFor(offset, maxAlign), align: maxAlign };
}

function primitiveLayout(type: string, zeroCopy: boolean): { readonly size: number; readonly align: number } {
  if (type === "bool" && zeroCopy) throw new Error("Zero-copy bool fields are not supported. Use u8 for flags.");
  switch (type) {
    case "u8": case "i8": case "bool": return { size: 1, align: 1 };
    case "u16": case "i16": return { size: 2, align: 2 };
    case "u32": case "i32": case "f32": return { size: 4, align: 4 };
    case "u64": case "i64": case "f64": return { size: 8, align: 8 };
    case "u128": case "i128": return { size: 16, align: 16 };
    case "pubkey": return { size: 32, align: 1 };
    default: throw new Error(`Unsupported zero-copy primitive '${type}'`);
  }
}

function rustType(type: IrType, zeroCopy: boolean = false): string {
  if (typeof type === "string") return primitiveRustType(type, zeroCopy);
  if (type.kind === "struct_zc_ref") return toPascal(type.name);
  switch (type.kind) {
    case "option": return `Option<${rustType(type.inner, zeroCopy)}>`;
    case "vec": return `Vec<${rustType(type.inner, zeroCopy)}>`;
    case "array": return `[${rustType(type.inner, zeroCopy)}; ${type.size}]`;
  }
}

function primitiveRustType(type: string, zeroCopy: boolean): string {
  if (type === "bool" && zeroCopy) throw new Error("Zero-copy bool fields are not supported. Use u8 for flags.");
  if (type === "pubkey") return "Pubkey";
  if (type === "string") return "String";
  if (type === "bytes") return "Vec<u8>";
  return type;
}

function idlType(type: IrType): unknown {
  const map: Record<string, string> = {
    u8: "u8", u16: "u16", u32: "u32", u64: "u64", u128: "u128",
    i8: "i8", i16: "i16", i32: "i32", i64: "i64", i128: "i128",
    f32: "f32", f64: "f64",
    bool: "bool", pubkey: "publicKey", string: "string", bytes: "bytes",
  };
  if (typeof type === "string") return { defined: map[type] ?? type };
  if (type.kind === "struct_zc_ref") return { defined: type.name };
  switch (type.kind) {
    case "option": return { option: idlType(type.inner) };
    case "vec": return { vec: idlType(type.inner) };
    case "array": return { array: [idlType(type.inner), type.size] };
  }
}

function generateLibRs(program: IrProgram): string {
  const usesToken = program.instructions.some((ix) => hasTokenCpi(ix) || usesTokenAccounts(ix) || hasToken2022Cpi(ix));
  const cw = new CodeWriter();

  cw.line("#![allow(unexpected_cfgs)]");
  cw.blank();
  cw.line(generateImports(usesToken, program));
  cw.blank();
  cw.line(`declare_id!("${program.address}");`);
  cw.blank();

  if (program.errors.length > 0) {
    cw.line(generateErrors(program.errors).trim());
    cw.blank();
  }

  for (const event of program.events) {
    cw.line(generateEvent(event).trim());
    cw.blank();
  }

  for (const szc of program.structsZC) {
    cw.line(generateStructZC(szc, program.structsZC).trim());
    cw.blank();
  }

  for (const account of program.accounts) {
    cw.line(generateAccount(account, program.structsZC).trim());
    cw.blank();
  }

  cw.line(generateProgramModule(program).trim());
  cw.blank();

  for (const ix of program.instructions) {
    cw.line(generateAccountsStruct(ix, program.accounts).trim());
    cw.blank();
  }

  return cw.toString();
}
