import { parseSync } from "oxc-parser";
import type { Node } from "oxc-parser";
import {
  isMemberExpression,
  isIdentifier,
} from "#parser/node-helpers";
import type { IrType } from "#ir/types";

export function isIntegerSeedType(type: IrType): boolean {
  return (
    typeof type === "string" &&
    ["u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128"].includes(type)
  );
}

export function formatSeedType(type: IrType): string {
  return typeof type === "string" ? type : type.kind;
}

export function isCpiSol(node: Node): boolean {
  if (!isMemberExpression(node)) return false;
  return isIdentifier(node.object) && node.object.name === "cpi" && isIdentifier(node.property) && node.property.name === "sol";
}

export function parseBodyStatements(body: string): { readonly statements: readonly Node[]; readonly source: string } {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { statements: [], source: "" };
  const wrappedSource = `const __run = ${trimmed};`;
  const result = parseSync("body.ts", wrappedSource, {
    lang: "ts",
    sourceType: "module",
    astType: "ts",
    preserveParens: true,
  });

  if (result.errors.length > 0) {
    const first = result.errors[0]!;
    throw new Error(`Body parse error: ${first.message}`);
  }

  const stmt = result.program.body[0];
  if (stmt === undefined || stmt.type !== "VariableDeclaration") return { statements: [], source: wrappedSource };
  const declarator = stmt.declarations[0];
  if (declarator === undefined || declarator.init === null || declarator.init === undefined) return { statements: [], source: wrappedSource };
  if (declarator.init.type !== "ArrowFunctionExpression") return { statements: [], source: wrappedSource };
  const arrowBody = declarator.init.body;
  if (arrowBody.type === "BlockStatement") return { statements: arrowBody.body, source: wrappedSource };
  return { statements: [], source: wrappedSource };
}
