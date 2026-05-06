import {
  SyntaxKind,
  type Node,
  type CallExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type ShorthandPropertyAssignment,
  type PropertyAccessExpression,
  type StringLiteral,
} from "ts-morph";

export function isBsCall(
  node: Node | undefined,
  method: string,
): boolean {
  if (node === undefined || node.getKind() !== SyntaxKind.CallExpression)
    return false;
  return bsMethodName(node as CallExpression) === method;
}

export function isBsCallAny(node: Node): boolean {
  if (node.getKind() !== SyntaxKind.CallExpression) return false;
  return bsMethodName(node as CallExpression) !== undefined;
}

export function bsMethodName(call: CallExpression): string | undefined {
  const expr = call.getExpression();
  if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return undefined;
  const pa = expr as PropertyAccessExpression;
  const obj = pa.getExpression();
  if (obj.getKind() !== SyntaxKind.Identifier) return undefined;
  if (obj.getText() !== "bs") return undefined;
  return pa.getName();
}

export function isCallTo(
  node: Node | undefined,
  name: string,
): boolean {
  if (node === undefined || node.getKind() !== SyntaxKind.CallExpression)
    return false;
  const call = node as CallExpression;
  return calleeDirect(call) === name || bsMethodName(call) === name;
}

export function isMethodCall(node: Node): boolean {
  if (node.getKind() !== SyntaxKind.CallExpression) return false;
  return (
    (node as CallExpression).getExpression().getKind() ===
    SyntaxKind.PropertyAccessExpression
  );
}

export function calleeDirect(call: CallExpression): string | undefined {
  const expr = call.getExpression();
  return expr.getKind() === SyntaxKind.Identifier
    ? expr.getText()
    : undefined;
}

export function calleeMethod(call: CallExpression): string | undefined {
  const expr = call.getExpression();
  return expr.getKind() === SyntaxKind.PropertyAccessExpression
    ? (expr as PropertyAccessExpression).getName()
    : undefined;
}

export function unwrapChainedMethod(
  call: CallExpression,
): string | undefined {
  const expr = call.getExpression();
  if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return undefined;
  const pa = expr as PropertyAccessExpression;
  const obj = pa.getExpression();
  if (obj.getKind() !== SyntaxKind.CallExpression) return undefined;
  return (
    bsMethodName(obj as CallExpression) ?? calleeMethod(obj as CallExpression)
  );
}

export function callArgId(
  call: CallExpression,
  index: number,
): string | undefined {
  const arg = call.getArguments()[index];
  return arg !== undefined && arg.getKind() === SyntaxKind.Identifier
    ? arg.getText()
    : undefined;
}

export function callArgStr(
  call: CallExpression,
  index: number,
): string | undefined {
  const arg = call.getArguments()[index];
  if (arg === undefined || arg.getKind() !== SyntaxKind.StringLiteral)
    return undefined;
  return (arg as StringLiteral).getLiteralValue();
}

export function isObject(node: Node): boolean {
  return node.getKind() === SyntaxKind.ObjectLiteralExpression;
}

export function isPropAssign(node: Node): node is PropertyAssignment {
  return node.getKind() === SyntaxKind.PropertyAssignment;
}

export function isShorthand(
  node: Node,
): node is ShorthandPropertyAssignment {
  return node.getKind() === SyntaxKind.ShorthandPropertyAssignment;
}

export function getStringProp(
  obj: ObjectLiteralExpression,
  name: string,
): string | undefined {
  const prop = obj.getProperty(name);
  if (prop === undefined || !isPropAssign(prop)) return undefined;
  const init = prop.getInitializer();
  if (init?.getKind() === SyntaxKind.StringLiteral)
    return (init as StringLiteral).getLiteralValue();
  return undefined;
}

export function getObjProp(
  obj: ObjectLiteralExpression,
  name: string,
): ObjectLiteralExpression | undefined {
  const prop = obj.getProperty(name);

  if (prop !== undefined && isPropAssign(prop)) {
    const init = prop.getInitializer();
    if (init !== undefined && isObject(init))
      return init as ObjectLiteralExpression;
  }

  if (prop !== undefined && isShorthand(prop)) {
    const refName = prop.getName();
    const sf = obj.getSourceFile();
    for (const decl of sf.getVariableDeclarations()) {
      if (decl.getName() !== refName) continue;
      const init = decl.getInitializer();
      if (init !== undefined && isObject(init))
        return init as ObjectLiteralExpression;
    }
  }

  return undefined;
}

export function propName(prop: Node): string | undefined {
  if (prop.getKind() === SyntaxKind.PropertyAssignment)
    return (prop as PropertyAssignment).getName();
  if (prop.getKind() === SyntaxKind.ShorthandPropertyAssignment)
    return (prop as ShorthandPropertyAssignment).getName();
  return undefined;
}

export function propStringValue(prop: Node): string | undefined {
  if (!isPropAssign(prop)) return undefined;
  const init = prop.getInitializer();
  if (init?.getKind() === SyntaxKind.StringLiteral)
    return (init as StringLiteral).getLiteralValue();
  return undefined;
}

export function unwrapMethodChain(
  node: Node,
): CallExpression | undefined {
  if (node.getKind() !== SyntaxKind.CallExpression) return undefined;
  const call = node as CallExpression;
  const expr = call.getExpression();
  if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
    const paExpr = expr as PropertyAccessExpression;
    const obj = paExpr.getExpression();
    if (obj.getKind() === SyntaxKind.CallExpression)
      return unwrapMethodChain(obj);
  }
  return call;
}
