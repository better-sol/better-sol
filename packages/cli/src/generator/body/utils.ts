import { Node, Project, type Statement } from "ts-morph";
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
  if (!Node.isPropertyAccessExpression(node)) return false;
  return (
    node.getExpression().getText() === "cpi" && node.getName() === "sol"
  );
}

export function parseBodyStatements(body: string): readonly Statement[] {
  const trimmed = body.trim();
  if (trimmed.length === 0) return [];
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(
    "body.ts",
    `const __run = () => ${trimmed};`,
  );
  const declaration = sourceFile.getVariableDeclarationOrThrow("__run");
  const initializer = declaration.getInitializer();
  if (initializer === undefined || !Node.isArrowFunction(initializer))
    return [];
  const arrowBody = initializer.getBody();
  if (Node.isBlock(arrowBody)) return arrowBody.getStatements();
  return [];
}
