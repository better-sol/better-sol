import type {
  IrAccount, IrAccountField, IrError, IrEvent, IrEventField,
  IrInstruction, IrInstructionAccount, IrInstructionArg, IrProgram,
  IrSeed, IrStructZC, IrType, PrimitiveType,
} from "#ir";
import type { Node, Program, CallExpression, ObjectExpression, VariableDeclarator } from "oxc-parser";

import { parseModule } from "./parse";

import {
  isCallExpression,
  isIdentifier,
  isObjectExpression,
  isArrowFunctionExpression,
  isStringLiteral,
  isProperty,
  unwrapParenthesized,
  unwrapMethodChain,
  unwrapChainedMethod,
  calleeIsBsMethod,
  calleeIsIdentifier,
  calleeMethod,
  getPropertyName,
  getObjectProperty,
  getObjectPropertyString,
  getCallArgIdentifier,
  getCallArgStringLiteral,
  getCallArgText,
  nodeTextOf,
} from "./node-helpers";

import { paddingFor } from "#generator/layout";

type RawAccount = {
  readonly name: string;
  readonly fields: readonly IrAccountField[];
  readonly zeroCopy: boolean;
  readonly seeds: readonly IrSeed[];
  readonly hasOneFields: readonly string[];
};

function getVariableDeclarations(stmt: Node): readonly VariableDeclarator[] {
  if (stmt.type === "VariableDeclaration" && stmt.kind === "const") return stmt.declarations;
  if (stmt.type === "ExportNamedDeclaration" && stmt.declaration !== null && stmt.declaration !== undefined && stmt.declaration.type === "VariableDeclaration" && stmt.declaration.kind === "const") return stmt.declaration.declarations;
  return [];
}

export function parseProgramsFromFile(source: string, filePath: string): readonly IrProgram[] {
  const program = parseModule(filePath, source);
  const rawStructZCs = collectStructZCs(source, program);
  const rawAccounts = collectAccounts(source, program, rawStructZCs);
  const results: IrProgram[] = [];

  for (const stmt of program.body) {
    for (const decl of getVariableDeclarations(stmt)) {
      if (!isIdentifier(decl.id)) continue;
      if (decl.init === null || decl.init === undefined) continue;
      if (!isCallExpression(decl.init)) continue;
      if (!isBsCall(source, decl.init, "program")) continue;

      const firstArg = decl.init.arguments[0];
      if (firstArg === undefined || !isObjectExpression(firstArg)) continue;

      const configObj = firstArg;
      const exportName = decl.id.name;
      const name = getObjectPropertyString(configObj, "name") ?? exportName;
      const address = getObjectPropertyString(configObj, "address") ?? "11111111111111111111111111111111";
      const rawErrors = extractErrors(configObj) ?? [];
      const rawEvents = extractEvents(source, program, configObj) ?? [];

      const instructions = parseCallbackInstructions(source, decl.init, rawAccounts);

      results.push({
        name,
        address,
        accounts: rawAccounts.map((raw) => computeSpace(raw, rawStructZCs)),
        instructions,
        errors: rawErrors,
        events: rawEvents,
        structsZC: rawStructZCs,
      });
    }
  }

  return results;
}

function isBsCall(source: string, node: Node, method: string): boolean {
  if (!isCallExpression(node)) return false;
  return calleeIsBsMethod(source, node) === method;
}

function collectStructZCs(source: string, program: Program): readonly IrStructZC[] {
  const structs: IrStructZC[] = [];

  for (const stmt of program.body) {
    for (const decl of getVariableDeclarations(stmt)) {
      if (!isIdentifier(decl.id)) continue;
      if (decl.init === null || decl.init === undefined) continue;
      if (!isCallExpression(decl.init)) continue;
      if (!isBsCall(source, decl.init, "struct")) continue;
      const firstArg = decl.init.arguments[0];
      if (firstArg === undefined || !isObjectExpression(firstArg)) continue;
      structs.push({ name: decl.id.name, fields: parseFields(source, firstArg) });
    }
  }

  return structs;
}

function collectAccounts(source: string, program: Program, rawStructZCs: readonly IrStructZC[]): readonly RawAccount[] {
  const accounts: RawAccount[] = [];

  for (const stmt of program.body) {
    for (const decl of getVariableDeclarations(stmt)) {
      if (!isIdentifier(decl.id)) continue;
      if (decl.init === null || decl.init === undefined) continue;
      const call = unwrapMethodChain(source, decl.init);
      if (call === undefined || !isBsCall(source, call, "account")) continue;

      const name = decl.id.name;
      const firstArg = call.arguments[0];
      if (firstArg === undefined || !isObjectExpression(firstArg)) continue;

      const fields = parseFields(source, firstArg);
      const chainText = nodeTextOf(source, decl.init);
      if (chainText.includes(".pda(")) throw new Error(".pda() was renamed to .derive(). Use .derive((seed) => ['literal', seed.fieldName]).");
      if (chainText.includes(".seeds(")) throw new Error(".seeds() was removed. Use .derive((seed) => ['literal', seed.fieldName]).");
      const zeroCopy = chainText.includes(".zeroCopy");
      if (zeroCopy) validateZeroCopyFields(name, fields, rawStructZCs);
      const seeds = parseSeeds(chainText);
      const hasOneFields = parseHasOneFields(chainText);

      accounts.push({ name, fields, zeroCopy, seeds, hasOneFields });
    }
  }

  return accounts;
}

function extractErrors(programObj: ObjectExpression): readonly IrError[] | undefined {
  const errorsValue = getObjectProperty(programObj, "errors");
  if (errorsValue === undefined || !isObjectExpression(errorsValue)) return undefined;
  const errors: IrError[] = [];
  for (const prop of errorsValue.properties) {
    if (!isProperty(prop)) continue;
    const name = getPropertyName(prop);
    if (name === undefined) continue;
    const message = isStringLiteral(prop.value) ? prop.value.value : name;
    errors.push({ name, message });
  }
  return errors.length > 0 ? errors : undefined;
}

function extractEvents(source: string, program: Program, programObj: ObjectExpression): readonly IrEvent[] | undefined {
  const eventsValue = resolveEventObject(program, programObj);
  if (eventsValue === undefined) return undefined;
  const events: IrEvent[] = [];
  for (const prop of eventsValue.properties) {
    if (!isProperty(prop)) continue;
    const name = getPropertyName(prop);
    if (name === undefined) continue;
    if (isObjectExpression(prop.value)) {
      events.push({ name, fields: parseFields(source, prop.value) as IrEventField[] });
    }
  }
  return events.length > 0 ? events : undefined;
}

function resolveEventObject(program: Program, programObj: ObjectExpression): ObjectExpression | undefined {
  const eventsValue = getObjectProperty(programObj, "events");
  if (eventsValue === undefined) return undefined;
  if (isObjectExpression(eventsValue)) return eventsValue;
  if (isIdentifier(eventsValue)) {
    const resolved = resolveConstObject(program, eventsValue.name);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

function resolveConstObject(program: Program, name: string): ObjectExpression | undefined {
  for (const stmt of program.body) {
    for (const decl of getVariableDeclarations(stmt)) {
      if (!isIdentifier(decl.id)) continue;
      if (decl.id.name !== name) continue;
      if (decl.init === null || decl.init === undefined) continue;
      if (isCallExpression(decl.init)) {
        const firstArg = decl.init.arguments[0];
        if (firstArg !== undefined && isObjectExpression(firstArg)) return firstArg;
      }
      if (isObjectExpression(decl.init)) return decl.init;
    }
  }
  return undefined;
}

function parseCallbackInstructions(source: string, call: CallExpression, rawAccounts: readonly RawAccount[]): readonly IrInstruction[] {
  const secondArg = call.arguments[1];
  if (secondArg === undefined || !isArrowFunctionExpression(secondArg)) return [];
  const body = unwrapParenthesized(secondArg.body);
  if (isObjectExpression(body)) return parseInstructionDefinitions(source, body, rawAccounts);
  return [];
}

function parseInstructionDefinitions(source: string, instructionsObj: ObjectExpression, rawAccounts: readonly RawAccount[]): readonly IrInstruction[] {
  const instructions: IrInstruction[] = [];
  for (const prop of instructionsObj.properties) {
    if (!isProperty(prop)) continue;
    const name = getPropertyName(prop);
    if (name === undefined) continue;
    const value = prop.value;
    if (!isCallExpression(value)) continue;
    if (calleeIsIdentifier(value) !== "ix") continue;

    const ixObj = value.arguments[0];
    if (ixObj === undefined || !isObjectExpression(ixObj)) continue;

    const accounts = parseIxAccounts(source, ixObj, rawAccounts);
    const args = parseIxArgs(source, ixObj);
    assertDistinctAccountAndArgNames(name, accounts, args);
    const body = extractBody(source, ixObj);
    const returnType = parseReturnType(source, ixObj);
    instructions.push({ name, accounts, args, body, returnType });
  }
  return instructions;
}

function parseIxAccounts(source: string, ixObj: ObjectExpression, rawAccounts: readonly RawAccount[]): readonly IrInstructionAccount[] {
  const accountsValue = getObjectProperty(ixObj, "accounts");
  if (accountsValue === undefined || !isObjectExpression(accountsValue)) return [];

  const accounts: IrInstructionAccount[] = [];
  for (const prop of accountsValue.properties) {
    const name = getPropertyName(prop);
    if (name === undefined) continue;
    accounts.push({ name, constraint: resolveConstraint(source, prop, name, rawAccounts) });
  }
  return accounts;
}

function resolveConstraint(source: string, prop: Node, accountName: string, rawAccounts: readonly RawAccount[]): IrInstructionAccount["constraint"] {
  if (isProperty(prop) && prop.shorthand) {
    const refName = getPropertyName(prop);
    const hasMatch = rawAccounts.some((a) => a.name === refName);
    return { kind: "bare", accountName: hasMatch ? refName! : accountName };
  }

  if (!isProperty(prop)) return { kind: "bare", accountName };
  const init = prop.value;

  if (isIdentifier(init)) {
    if (init.name === "bs") return { kind: "bare", accountName };
    const hasMatch = rawAccounts.some((a) => a.name === init.name);
    return { kind: "bare", accountName: hasMatch ? init.name : accountName };
  }

  if (!isCallExpression(init)) {
    const text = nodeTextOf(source, init);
    const hasMatch = rawAccounts.some((a) => a.name === text);
    return { kind: "bare", accountName: hasMatch ? text : accountName };
  }

  const isWritableChain = calleeMethod(source, init) === "writable";
  const method = isWritableChain
    ? (unwrapChainedMethod(source, init) ?? calleeIsBsMethod(source, init) ?? "unknown")
    : (calleeIsBsMethod(source, init) ?? calleeMethod(source, init));

  switch (method) {
    case "init":
      return { kind: "init", accountName: getCallArgIdentifier(init, 0) ?? accountName };
    case "initIfNeeded":
      return { kind: "initIfNeeded", accountName: getCallArgIdentifier(init, 0) ?? accountName };
    case "mut":
      return { kind: "mut", accountName: getCallArgIdentifier(init, 0) ?? accountName };
    case "signer":
      return { kind: "signer" };
    case "mint":
      return { kind: "mint", mutable: isWritableChain };
    case "tokenAccount":
      return { kind: "tokenAccount", mutable: isWritableChain };
    case "tokenProgram":
      return { kind: "tokenProgram" };
    case "token2022Program":
      return { kind: "token2022Program" };
    case "systemProgram":
      return { kind: "systemProgram" };
    case "clock":
      return { kind: "clock" };
    case "close": {
      const refundTo = getCallArgIdentifier(init, 1) ?? getCallArgStringLiteral(init, 1) ?? "authority";
      return { kind: "close", accountName: getCallArgIdentifier(init, 0) ?? accountName, refundTo };
    }
    case "realloc": {
      const reallocSpace = parseInt(getCallArgText(source, init, 1) ?? "0", 10);
      return { kind: "realloc", accountName: getCallArgIdentifier(init, 0) ?? accountName, space: isNaN(reallocSpace) ? 0 : reallocSpace };
    }
    case "remaining": {
      const argText = getCallArgText(source, init, 0) ?? "";
      if (argText.includes("tokenAccount")) return { kind: "remaining", itemType: "tokenAccount" };
      if (argText.includes("signer")) return { kind: "remaining", itemType: "signer" };
      return { kind: "remaining", itemType: "account", accountName: argText };
    }
    default:
      return { kind: "bare", accountName };
  }
}

function parseIxArgs(source: string, ixObj: ObjectExpression): readonly IrInstructionArg[] {
  const argsValue = getObjectProperty(ixObj, "args");
  if (argsValue === undefined || !isObjectExpression(argsValue)) return [];

  const args: IrInstructionArg[] = [];
  for (const prop of argsValue.properties) {
    if (!isProperty(prop)) continue;
    const name = getPropertyName(prop);
    if (name === undefined) continue;
    args.push({ name, type: resolveType(source, prop.value) });
  }
  return args;
}

function assertDistinctAccountAndArgNames(ixName: string, accounts: readonly IrInstructionAccount[], args: readonly IrInstructionArg[]): void {
  const argNames = new Set(args.map((arg) => arg.name));
  for (const account of accounts) {
    if (argNames.has(account.name)) throw new Error(`Instruction '${ixName}' has both an account and arg named '${account.name}'. Rename one of them.`);
  }
}

function extractBody(source: string, ixObj: ObjectExpression): string {
  const runValue = getObjectProperty(ixObj, "run");
  if (runValue === undefined || !isArrowFunctionExpression(runValue)) return "";
  return nodeTextOf(source, runValue);
}

function parseReturnType(source: string, ixObj: ObjectExpression): IrType | undefined {
  const returnsValue = getObjectProperty(ixObj, "returns");
  if (returnsValue === undefined) return undefined;
  return resolveType(source, returnsValue);
}

function parseFields(source: string, obj: ObjectExpression): readonly IrAccountField[] {
  const fields: IrAccountField[] = [];
  for (const prop of obj.properties) {
    if (!isProperty(prop)) continue;
    const name = getPropertyName(prop);
    if (name === undefined) continue;
    fields.push({ name, type: resolveType(source, prop.value) });
  }
  return fields;
}

function resolveType(source: string, node: Node): IrType {
  if (isCallExpression(node)) {
    const callee = calleeIsBsMethod(source, node) ?? calleeMethod(source, node) ?? calleeIsIdentifier(node) ?? "";
    if (callee === "optional") {
      const inner = node.arguments[0];
      return { kind: "option", inner: inner !== undefined ? resolveType(source, inner) : "pubkey" as PrimitiveType };
    }
    if (callee === "vector") {
      const inner = node.arguments[0];
      return { kind: "vec", inner: inner !== undefined ? resolveType(source, inner) : "pubkey" as PrimitiveType, max: 32 };
    }
    if (callee === "array") {
      const inner = node.arguments[0];
      const sizeArg = node.arguments[1];
      const size = sizeArg !== undefined ? parseInt(nodeTextOf(source, sizeArg), 10) : 1;
      return { kind: "array", inner: inner !== undefined ? resolveType(source, inner) : "u8" as PrimitiveType, size: isNaN(size) ? 1 : size };
    }
    const primitive = tryResolvePrimitive(callee);
    return primitive !== undefined ? primitive : { kind: "struct_zc_ref", name: callee };
  }

  if (isIdentifier(node)) {
    const primitive = tryResolvePrimitive(node.name);
    return primitive !== undefined ? primitive : { kind: "struct_zc_ref", name: node.name };
  }

  return "u8";
}

function tryResolvePrimitive(name: string): PrimitiveType | undefined {
  const valid: readonly string[] = [
    "u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128",
    "f32", "f64", "bool", "pubkey", "string", "bytes",
  ];
  return valid.includes(name) ? name as PrimitiveType : undefined;
}

function parseSeeds(chainText: string): readonly IrSeed[] {
  const args = extractPdaArgs(chainText);
  if (args === undefined) return [];
  const seeds: IrSeed[] = [];
  const regex = /\b[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(args)) !== null) {
    const field = match[1];
    const singleQuotedLiteral = match[2];
    const doubleQuotedLiteral = match[3];
    if (field !== undefined) seeds.push({ kind: "field", fieldName: field });
    else if (singleQuotedLiteral !== undefined && singleQuotedLiteral !== "") seeds.push(parseLiteralSeed(singleQuotedLiteral));
    else if (doubleQuotedLiteral !== undefined && doubleQuotedLiteral !== "") seeds.push(parseLiteralSeed(doubleQuotedLiteral));
  }
  return seeds;
}

function parseLiteralSeed(value: string): IrSeed {
  if (/^\{[A-Za-z_$][\w$]*\}$/.test(value)) throw new Error(`Dynamic PDA seed template '${value}' is not supported. Store the value as an account field and reference it with seed.${value.slice(1, -1)}.`);
  return { kind: "literal", value };
}

function parseHasOneFields(chainText: string): readonly string[] {
  const fields: string[] = [];
  const regex = /\.hasOne\(["']([^"']+)["']\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(chainText)) !== null) {
    fields.push(match[1]!);
  }
  return fields;
}

function extractPdaArgs(chainText: string): string | undefined {
  const start = chainText.indexOf(".derive(");
  if (start === -1) return undefined;
  const argsStart = start + ".derive(".length;
  let depth = 1;
  for (let index = argsStart; index < chainText.length; index += 1) {
    const char = chainText[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth === 0) return chainText.slice(argsStart, index);
  }
  return undefined;
}

function validateZeroCopyFields(accountName: string, fields: readonly IrAccountField[], structs: readonly IrStructZC[]): void {
  for (const field of fields) {
    try {
      zeroCopyTypeLayout(field.type, structs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unsupported zero-copy type";
      throw new Error(`Account '${accountName}' field '${field.name}' is not zero-copy safe: ${message}`, { cause: error });
    }
  }
}

function computeSpace(raw: RawAccount, structs: readonly IrStructZC[]): IrAccount {
  const space = raw.zeroCopy
    ? 8 + structLayout(raw.fields, structs).size
    : 8 + raw.fields.reduce((sum, field) => sum + borshFieldSize(field.type, structs), 0);
  return { name: raw.name, fields: raw.fields, zeroCopy: raw.zeroCopy, seeds: raw.seeds, space, hasOneFields: raw.hasOneFields };
}

function borshFieldSize(type: IrType, structs: readonly IrStructZC[]): number {
  if (typeof type === "string") {
    switch (type) {
      case "u8": case "i8": case "bool": return 1;
      case "u16": case "i16": return 2;
      case "u32": case "i32": case "f32": return 4;
      case "u64": case "i64": case "f64": return 8;
      case "u128": case "i128": return 16;
      case "pubkey": return 32;
      case "string": case "bytes": return 64;
    }
  }
  switch (type.kind) {
    case "option": return 1 + borshFieldSize(type.inner, structs);
    case "vec": return 4 + type.max * borshFieldSize(type.inner, structs);
    case "array": return type.size * borshFieldSize(type.inner, structs);
    case "struct_zc_ref": return structLayout(structs.find((candidate) => candidate.name === type.name)?.fields ?? [], structs).size;
  }
}

function structLayout(fields: readonly IrAccountField[], structs: readonly IrStructZC[]): { readonly size: number; readonly align: number } {
  let offset = 0;
  let maxAlign = 1;
  for (const field of fields) {
    const layout = zeroCopyTypeLayout(field.type, structs);
    offset += paddingFor(offset, layout.align) + layout.size;
    maxAlign = Math.max(maxAlign, layout.align);
  }
  return { size: offset + paddingFor(offset, maxAlign), align: maxAlign };
}

function zeroCopyTypeLayout(type: IrType, structs: readonly IrStructZC[]): { readonly size: number; readonly align: number } {
  if (typeof type === "string") return primitiveLayout(type);
  if (type.kind === "array") {
    const inner = zeroCopyTypeLayout(type.inner, structs);
    return { size: inner.size * type.size, align: inner.align };
  }
  if (type.kind === "struct_zc_ref") {
    const struct = structs.find((candidate) => candidate.name === type.name);
    if (struct === undefined) throw new Error(`unknown zero-copy struct '${type.name}'`);
    return structLayout(struct.fields, structs);
  }
  throw new Error(`unsupported type '${type.kind}'`);
}

function primitiveLayout(type: string): { readonly size: number; readonly align: number } {
  switch (type) {
    case "u8": case "i8": return { size: 1, align: 1 };
    case "u16": case "i16": return { size: 2, align: 2 };
    case "u32": case "i32": case "f32": return { size: 4, align: 4 };
    case "u64": case "i64": case "f64": return { size: 8, align: 8 };
    case "u128": case "i128": return { size: 16, align: 16 };
    case "pubkey": return { size: 32, align: 1 };
    default: throw new Error(`unsupported primitive '${type}'`);
  }
}
