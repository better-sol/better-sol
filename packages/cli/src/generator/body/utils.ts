import { parseSync } from "oxc-parser";
import type { Node } from "oxc-parser";
import {
  isMemberExpression,
  isIdentifier,
} from "#parser/node-helpers";
import type { IrType } from "#ir";

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

export type ParsedBody = {
  readonly statements: readonly Node[];
  readonly params: readonly Node[];
  readonly source: string;
};

export function parseBodyStatements(body: string): ParsedBody {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { statements: [], params: [], source: "" };
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
  if (stmt === undefined || stmt.type !== "VariableDeclaration") return { statements: [], params: [], source: wrappedSource };
  const declarator = stmt.declarations[0];
  if (declarator === undefined || declarator.init === null || declarator.init === undefined) return { statements: [], params: [], source: wrappedSource };
  if (declarator.init.type !== "ArrowFunctionExpression") return { statements: [], params: [], source: wrappedSource };
  const arrowBody = declarator.init.body;
  const statements = arrowBody.type === "BlockStatement" ? arrowBody.body : [];
  return { statements, params: declarator.init.params, source: wrappedSource };
}
