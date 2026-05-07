import type {
  IrAccount, IrInstruction, IrInstructionAccount, IrInstructionArg, IrProgram,
} from "#ir";
import { CodeWriter } from "../code-writer";
import { toPascal, toSnake, rustType, formatSeedBytes } from "./types";
import { transpileBody } from "../body";

export function generateProgramModule(program: IrProgram): string {
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
  const returnType = ix.returnType !== undefined ? rustType(ix.returnType) : "()";
  const trailingOk = ix.returnType !== undefined ? "" : "        Ok(())\n";
  return `    pub fn ${toSnake(ix.name)}(${contextName}: Context<${toPascal(ix.name)}>${argList}) -> Result<${returnType}> {\n${body}${trailingOk}    }`;
}

export function generateAccountsStruct(ix: IrInstruction, accounts: readonly IrAccount[]): string {
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
      const seeds = accountDef !== undefined ? formatSeedsForAttr(accountDef, ixAccounts, ixArgs, acc.name) : undefined;
      const payer = findPayer(ixAccounts);

      lines.push("#[account(");
      lines.push(`    ${initKind},`);
      lines.push(`    payer = ${toSnake(payer)},`);
      lines.push(`    space = ${space},`);
      for (const attr of hasOneConstraints(accountDef)) lines.push(`    ${attr},`);
      if (seeds !== undefined) {
        lines.push(`    seeds = [${seeds}],`);
        lines.push("    bump");
      }
      lines.push(")]");
      break;
    }
    case "mut": {
      const accountDef = findAccountDef(c.accountName, accounts);
      const seeds = accountDef !== undefined ? formatSeedsForAttr(accountDef, ixAccounts, ixArgs, acc.name) : undefined;
      const hasOneAttrs = hasOneConstraints(accountDef);
      const hasExtraAttrs = seeds !== undefined || hasOneAttrs.length > 0;
      if (hasExtraAttrs) {
        lines.push("#[account(");
        lines.push("    mut,");
        for (const attr of hasOneAttrs) lines.push(`    ${attr},`);
        if (seeds !== undefined) {
          lines.push(`    seeds = [${seeds}],`);
          lines.push("    bump");
        }
        lines.push(")]");
      } else {
        lines.push("#[account(mut)]");
      }
      break;
    }
    case "close":
      lines.push(`#[account(mut, close = ${toSnake(c.refundTo)})]`);
      break;
    case "realloc": {
      const accountDef = findAccountDef(c.accountName, accounts);
      const seeds = accountDef !== undefined ? formatSeedsForAttr(accountDef, ixAccounts, ixArgs, acc.name) : undefined;
      const payer = findPayer(ixAccounts);
      lines.push("#[account(");
      lines.push("    mut,");
      lines.push(`    realloc = ${c.space},`);
      lines.push(`    realloc::payer = ${toSnake(payer)},`);
      lines.push(`    realloc::zero = ${c.space},`);
      if (seeds !== undefined) {
        lines.push(`    seeds = [${seeds}],`);
        lines.push("    bump");
      }
      lines.push(")]");
      break;
    }
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
      const seeds = accountDef !== undefined ? formatSeedsForAttr(accountDef, ixAccounts, ixArgs, acc.name) : undefined;
      const hasOneAttrs = hasOneConstraints(accountDef);
      if (seeds !== undefined || hasOneAttrs.length > 0) {
        lines.push("#[account(");
        for (const attr of hasOneAttrs) lines.push(`    ${attr},`);
        if (seeds !== undefined) {
          lines.push(`    seeds = [${seeds}],`);
          lines.push("    bump");
        }
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

  const accountName = c.kind === "init" || c.kind === "initIfNeeded" || c.kind === "mut" || c.kind === "close" || c.kind === "realloc" || c.kind === "bare"
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

function hasOneConstraints(accountDef: IrAccount | undefined): readonly string[] {
  if (accountDef === undefined || accountDef.hasOneFields.length === 0) return [];
  return accountDef.hasOneFields.map((field) => `has_one = ${toSnake(field)}`);
}

function findPayer(allAccounts: readonly IrInstructionAccount[]): string {
  const signer = allAccounts.find((acc) => acc.constraint.kind === "signer");
  return signer !== undefined ? toSnake(signer.name) : "authority";
}

function needsSystemProgram(ix: IrInstruction): boolean {
  const hasInit = ix.accounts.some((acc) => acc.constraint.kind === "init" || acc.constraint.kind === "initIfNeeded" || acc.constraint.kind === "realloc");
  const hasSystemProgram = ix.accounts.some((acc) => acc.constraint.kind === "systemProgram");
  return hasInit && !hasSystemProgram;
}

function isMutable(acc: IrInstructionAccount): boolean {
  const c = acc.constraint;
  return c.kind === "mut" || c.kind === "init" || c.kind === "initIfNeeded" || c.kind === "close" || c.kind === "realloc" ||
    (c.kind === "tokenAccount" && c.mutable) ||
    (c.kind === "mint" && c.mutable);
}

function formatSeedsForAttr(
  account: IrAccount,
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
      ? `${toSnake(currentAccountName)}.load()??.${toSnake(seed.fieldName)}`
      : `${toSnake(currentAccountName)}.${toSnake(seed.fieldName)}`;
    return formatSeedBytes(fieldName, field.type);
  }).join(", ");
}

export { isMutable };
