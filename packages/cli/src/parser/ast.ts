import type {
  IrAccount, IrAccountField, IrError, IrEvent, IrEventField,
  IrInstruction, IrInstructionAccount, IrInstructionArg, IrProgram,
  IrSeed, IrStructZC, IrType, PrimitiveType,
} from "#ir/types";

import {
  Project, SyntaxKind,
  type Node, type CallExpression, type ObjectLiteralExpression,
  type PropertyAssignment, type ShorthandPropertyAssignment,
  type ArrowFunction, type SourceFile as TsSourceFile,
} from "ts-morph";

import {
  isBsCall,
  isBsCallAny,
  bsMethodName,
  isCallTo,
  isMethodCall,
  calleeDirect,
  calleeMethod,
  unwrapChainedMethod,
  callArgId,
  callArgStr,
  isObject,
  isPropAssign,
  isShorthand,
  getStringProp,
  getObjProp,
  propName,
  propStringValue,
  unwrapMethodChain,
} from "./helpers";

import { paddingFor } from "#generator/layout";

type RawAccount = {
  readonly name: string;
  readonly fields: readonly IrAccountField[];
  readonly zeroCopy: boolean;
  readonly seeds: readonly IrSeed[];
  readonly hasOneFields: readonly string[];
};

export function parseProgramsFromFile(source: string, filePath: string): readonly IrProgram[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile(filePath, source);

  const rawStructZCs = collectStructZCs(sf);
  const rawAccounts = collectAccounts(sf, rawStructZCs);
  const results: IrProgram[] = [];

  for (const decl of sf.getVariableDeclarations()) {
    const init = decl.getInitializer();
    if (!isBsCall(init, "program")) continue;

    const call = init as CallExpression;
    const firstArg = call.getArguments()[0];
    if (firstArg === undefined || !isObject(firstArg)) continue;

    const configObj = firstArg as ObjectLiteralExpression;
    const exportName = decl.getName();
    const name = getStringProp(configObj, "name") ?? exportName;
    const address = getStringProp(configObj, "address") ?? "11111111111111111111111111111111";
    const rawErrors = extractErrors(configObj) ?? [];
    const rawEvents = extractEvents(configObj) ?? [];

    const instructions = parseCallbackInstructions(call, rawAccounts);

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

  return results;
}

function collectAccounts(sf: TsSourceFile, rawStructZCs: readonly IrStructZC[]): readonly RawAccount[] {
  const accounts: RawAccount[] = [];

  for (const decl of sf.getVariableDeclarations()) {
    const init = decl.getInitializer();
    if (init === undefined) continue;
    const call = unwrapMethodChain(init);
    if (call === undefined || !isBsCall(call, "account")) continue;

    const name = decl.getName();
    const firstArg = call.getArguments()[0];
    if (firstArg === undefined || !isObject(firstArg)) continue;

    const fields = parseFields(firstArg as ObjectLiteralExpression);
    const chainText = init.getText();
    if (chainText.includes(".pda(")) throw new Error(".pda() was renamed to .derive(). Use .derive((seed) => ['literal', seed.fieldName]).");
    if (chainText.includes(".seeds(")) throw new Error(".seeds() was removed. Use .derive((seed) => ['literal', seed.fieldName]).");
    const zeroCopy = chainText.includes(".zeroCopy");
    if (zeroCopy) validateZeroCopyFields(name, fields, rawStructZCs);
    const seeds = parseSeeds(chainText);
    const hasOneFields = parseHasOneFields(chainText);

    accounts.push({ name, fields, zeroCopy, seeds, hasOneFields });
  }

  return accounts;
}

function extractErrors(programObj: ObjectLiteralExpression): readonly IrError[] | undefined {
  const errorsObj = getObjProp(programObj, "errors");
  if (errorsObj === undefined) return undefined;
  const errors: IrError[] = [];
  for (const prop of errorsObj.getProperties()) {
    const name = propName(prop);
    const message = propStringValue(prop);
    if (name !== undefined) errors.push({ name, message: message ?? name });
  }
  return errors.length > 0 ? errors : undefined;
}

function extractEvents(programObj: ObjectLiteralExpression): readonly IrEvent[] | undefined {
  const eventsObj = getObjProp(programObj, "events");
  if (eventsObj === undefined) return undefined;
  const events: IrEvent[] = [];
  for (const prop of eventsObj.getProperties()) {
    const name = propName(prop);
    if (name === undefined) continue;
    if (isPropAssign(prop)) {
      const value = prop.getInitializer();
      if (value !== undefined && isObject(value)) {
        events.push({ name, fields: parseFields(value as ObjectLiteralExpression) as IrEventField[] });
      }
    }
  }
  return events.length > 0 ? events : undefined;
}

function collectStructZCs(sf: TsSourceFile): readonly IrStructZC[] {
  const structs: IrStructZC[] = [];

  for (const decl of sf.getVariableDeclarations()) {
    const init = decl.getInitializer();
    if (!isBsCall(init, "struct")) continue;
    const call = init as CallExpression;
    const firstArg = call.getArguments()[0];
    if (firstArg === undefined || !isObject(firstArg)) continue;

    const name = decl.getName();
    const fields = parseFields(firstArg as ObjectLiteralExpression);
    structs.push({ name, fields });
  }

  return structs;
}

function parseCallbackInstructions(call: import("ts-morph").CallExpression, rawAccounts: readonly RawAccount[]): readonly IrInstruction[] {
  const secondArg = call.getArguments()[1];
  if (secondArg === undefined || secondArg.getKind() !== SyntaxKind.ArrowFunction) return [];
  const arrow = secondArg as import("ts-morph").ArrowFunction;
  const body = arrow.getBody();
  if (body === undefined) return [];
  if (body.getKind() === SyntaxKind.ObjectLiteralExpression) return parseInstructionDefinitions(body as ObjectLiteralExpression, rawAccounts);
  if (body.getKind() === SyntaxKind.ParenthesizedExpression) {
    const inner = (body as import("ts-morph").ParenthesizedExpression).getExpression();
    if (inner.getKind() === SyntaxKind.ObjectLiteralExpression) return parseInstructionDefinitions(inner as ObjectLiteralExpression, rawAccounts);
  }
  return [];
}

function parseInstructionDefinitions(instructionsObj: ObjectLiteralExpression, rawAccounts: readonly RawAccount[]): readonly IrInstruction[] {
  const instructions: IrInstruction[] = [];
  for (const prop of instructionsObj.getProperties()) {
    const name = propName(prop);
    if (name === undefined) continue;

    const value = isPropAssign(prop) ? prop.getInitializer() : undefined;
    if (value === undefined || !isCallTo(value, "ix")) continue;
    const ixCall = value as CallExpression;
    const ixObj = ixCall.getArguments()[0];
    if (ixObj === undefined || !isObject(ixObj)) continue;

    const obj = ixObj as ObjectLiteralExpression;
    const accounts = parseIxAccounts(obj, rawAccounts);
    const args = parseIxArgs(obj);
    assertDistinctAccountAndArgNames(name, accounts, args);
    const body = extractBody(obj);
    const returnType = parseReturnType(obj);
    instructions.push({ name, accounts, args, body, returnType });
  }

  return instructions;
}

function parseIxAccounts(ixObj: ObjectLiteralExpression, rawAccounts: readonly RawAccount[]): readonly IrInstructionAccount[] {
  const accountsObj = getObjProp(ixObj, "accounts");
  if (accountsObj === undefined) return [];

  const accounts: IrInstructionAccount[] = [];
  for (const prop of accountsObj.getProperties()) {
    const name = propName(prop);
    if (name === undefined) continue;
    accounts.push({ name, constraint: resolveConstraint(prop, name, rawAccounts) });
  }
  return accounts;
}

function resolveConstraint(prop: Node, accountName: string, rawAccounts: readonly RawAccount[]): IrInstructionAccount["constraint"] {
  if (isShorthand(prop)) {
    const refName = (prop as ShorthandPropertyAssignment).getName();
    const hasMatch = rawAccounts.some((a) => a.name === refName);
    return { kind: "bare", accountName: hasMatch ? refName : accountName };
  }

  if (!isPropAssign(prop)) return { kind: "bare", accountName };
  const init = (prop as PropertyAssignment).getInitializer();
  if (init === undefined) return { kind: "bare", accountName };

  if (init.getKind() === SyntaxKind.Identifier) {
    const text = init.getText();
    if (text === "bs") return { kind: "bare", accountName };
    const hasMatch = rawAccounts.some((a) => a.name === text);
    return { kind: "bare", accountName: hasMatch ? text : accountName };
  }

  if (!isBsCallAny(init) && !isMethodCall(init)) {
    const hasMatch = rawAccounts.some((a) => a.name === init.getText());
    return { kind: "bare", accountName: hasMatch ? init.getText() : accountName };
  }

  const call = init as CallExpression;
  const isWritableChain = calleeMethod(call) === "writable";
  const method = isWritableChain
    ? (unwrapChainedMethod(call) ?? bsMethodName(call) ?? "unknown")
    : (bsMethodName(call) ?? calleeMethod(call));

  switch (method) {
    case "init":
      return { kind: "init", accountName: callArgId(call, 0) ?? accountName };
    case "initIfNeeded":
      return { kind: "initIfNeeded", accountName: callArgId(call, 0) ?? accountName };
    case "mut":
      return { kind: "mut", accountName: callArgId(call, 0) ?? accountName };
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
      const refundTo = callArgId(call, 1) ?? callArgStr(call, 1) ?? "authority";
      return { kind: "close", accountName: callArgId(call, 0) ?? accountName, refundTo };
    }
    case "realloc": {
      const reallocSpace = parseInt(call.getArguments()[1]?.getText() ?? "0", 10);
      return { kind: "realloc", accountName: callArgId(call, 0) ?? accountName, space: isNaN(reallocSpace) ? 0 : reallocSpace };
    }
    case "remaining": {
      const argText = call.getArguments()[0]?.getText() ?? "";
      if (argText.includes("tokenAccount")) return { kind: "remaining", itemType: "tokenAccount" };
      if (argText.includes("signer")) return { kind: "remaining", itemType: "signer" };
      return { kind: "remaining", itemType: "account", accountName: call.getArguments()[0]?.getText() };
    }
    default:
      return { kind: "bare", accountName };
  }
}

function parseIxArgs(ixObj: ObjectLiteralExpression): readonly IrInstructionArg[] {
  const argsObj = getObjProp(ixObj, "args");
  if (argsObj === undefined) return [];

  const args: IrInstructionArg[] = [];
  for (const prop of argsObj.getProperties()) {
    const name = propName(prop);
    if (name === undefined || !isPropAssign(prop)) continue;
    const init = (prop as PropertyAssignment).getInitializer();
    if (init === undefined) continue;
    args.push({ name, type: resolveType(init) });
  }
  return args;
}

function assertDistinctAccountAndArgNames(ixName: string, accounts: readonly IrInstructionAccount[], args: readonly IrInstructionArg[]): void {
  const argNames = new Set(args.map((arg) => arg.name));
  for (const account of accounts) {
    if (argNames.has(account.name)) throw new Error(`Instruction '${ixName}' has both an account and arg named '${account.name}'. Rename one of them.`);
  }
}

function extractBody(ixObj: ObjectLiteralExpression): string {
  const runProp = ixObj.getProperty("run");
  if (runProp === undefined || !isPropAssign(runProp)) return "";
  const init = (runProp as PropertyAssignment).getInitializer();
  if (init === undefined || init.getKind() !== SyntaxKind.ArrowFunction) return "";
  const arrow = init as ArrowFunction;
  const body = arrow.getBody();
  return body.getText();
}

function parseReturnType(ixObj: ObjectLiteralExpression): IrType | undefined {
  const returnsProp = ixObj.getProperty("returns");
  if (returnsProp === undefined || !isPropAssign(returnsProp)) return undefined;
  const init = (returnsProp as PropertyAssignment).getInitializer();
  if (init === undefined) return undefined;
  return resolveType(init);
}

function parseFields(obj: ObjectLiteralExpression): readonly IrAccountField[] {
  const fields: IrAccountField[] = [];
  for (const prop of obj.getProperties()) {
    if (!isPropAssign(prop)) continue;
    const name = prop.getName();
    const init = prop.getInitializer();
    if (init === undefined) continue;
    fields.push({ name, type: resolveType(init) });
  }
  return fields;
}

function resolveType(node: Node): IrType {
  if (node.getKind() === SyntaxKind.CallExpression) {
    const call = node as CallExpression;
    const callee = bsMethodName(call) ?? calleeMethod(call) ?? calleeDirect(call) ?? "";
    if (callee === "optional") {
      const inner = call.getArguments()[0];
      return { kind: "option", inner: inner !== undefined ? resolveType(inner) : "pubkey" as PrimitiveType };
    }
    if (callee === "vector") {
      const inner = call.getArguments()[0];
      return { kind: "vec", inner: inner !== undefined ? resolveType(inner) : "pubkey" as PrimitiveType, max: 32 };
    }
    if (callee === "array") {
      const inner = call.getArguments()[0];
      const sizeArg = call.getArguments()[1];
      const size = sizeArg !== undefined ? parseInt(sizeArg.getText(), 10) : 1;
      return { kind: "array", inner: inner !== undefined ? resolveType(inner) : "u8" as PrimitiveType, size: isNaN(size) ? 1 : size };
    }
    const primitive = tryResolvePrimitive(callee);
    return primitive !== undefined ? primitive : { kind: "struct_zc_ref", name: callee };
  }

  if (node.getKind() === SyntaxKind.Identifier) {
    const name = node.getText();
    const primitive = tryResolvePrimitive(name);
    return primitive !== undefined ? primitive : { kind: "struct_zc_ref", name };
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


