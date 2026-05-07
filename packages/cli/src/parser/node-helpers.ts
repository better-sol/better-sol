import type {
  ArrayExpression,
  ArrowFunctionExpression,
  AssignmentExpression,
  BinaryExpression,
  BlockStatement,
  BooleanLiteral,
  BreakStatement,
  CallExpression,
  ComputedMemberExpression,
  ConditionalExpression,
  ContinueStatement,
  DoWhileStatement,
  ExpressionStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  Function as FunctionExpression,
  IdentifierName,
  IdentifierReference,
  IfStatement,
  LogicalExpression,
  MemberExpression,
  NewExpression,
  NullLiteral,
  NumericLiteral,
  ObjectExpression,
  ObjectProperty,
  SpreadElement,
  StaticMemberExpression,
  StringLiteral,
  SwitchStatement,
  SwitchCase,
  TemplateLiteral,
  TryStatement,
  CatchClause,
  UnaryExpression,
  UpdateExpression,
  VariableDeclaration,
  VariableDeclarator,
  WhileStatement,
  AwaitExpression,
  ExportNamedDeclaration,
  Node,
  ParamPattern,
  Program,
  ReturnStatement,
  ThrowStatement,
  ParenthesizedExpression,
  TSAsExpression,
  TSNonNullExpression,
} from "oxc-parser";

type Identifier = IdentifierReference | IdentifierName;

export type {
  Node,
  Program,
  CallExpression,
  MemberExpression,
  StaticMemberExpression,
  ComputedMemberExpression,
  Identifier,
  IdentifierReference,
  IdentifierName,
  ObjectExpression,
  ObjectProperty,
  ArrowFunctionExpression,
  BooleanLiteral,
  StringLiteral,
  NumericLiteral,
  NullLiteral,
  VariableDeclaration,
  VariableDeclarator,
  IfStatement,
  ForStatement,
  ForOfStatement,
  ForInStatement,
  BlockStatement,
  ExpressionStatement,
  BinaryExpression,
  LogicalExpression,
  AssignmentExpression,
  UnaryExpression,
  UpdateExpression,
  ConditionalExpression,
  ArrayExpression,
  NewExpression,
  SpreadElement,
  ReturnStatement,
  TemplateLiteral,
  WhileStatement,
  DoWhileStatement,
  SwitchStatement,
  SwitchCase,
  TryStatement,
  CatchClause,
  ThrowStatement,
  ContinueStatement,
  BreakStatement,
  FunctionExpression,
  AwaitExpression,
  ParenthesizedExpression,
  ExportNamedDeclaration,
  ParamPattern,
};

export function isCallExpression(node: Node | undefined): node is CallExpression {
  return node !== undefined && node.type === "CallExpression";
}

export function isMemberExpression(node: Node | undefined): node is MemberExpression {
  return node !== undefined && node.type === "MemberExpression";
}

export function isStaticMemberExpression(node: Node | undefined): node is StaticMemberExpression {
  return node !== undefined && node.type === "MemberExpression" && "computed" in node && (node as StaticMemberExpression).computed === false;
}

export function isComputedMemberExpression(node: Node | undefined): node is ComputedMemberExpression {
  return node !== undefined && node.type === "MemberExpression" && "computed" in node && (node as ComputedMemberExpression).computed === true;
}

export function isIdentifier(node: Node | undefined): node is Identifier {
  return node !== undefined && node.type === "Identifier";
}

export function isObjectExpression(node: Node | undefined): node is ObjectExpression {
  return node !== undefined && node.type === "ObjectExpression";
}

export function isArrowFunctionExpression(node: Node | undefined): node is ArrowFunctionExpression {
  return node !== undefined && node.type === "ArrowFunctionExpression";
}

export function isStringLiteral(node: Node | undefined): node is StringLiteral {
  return node !== undefined && node.type === "Literal" && typeof (node as StringLiteral).value === "string";
}

export function isNumericLiteral(node: Node | undefined): node is NumericLiteral {
  return node !== undefined && node.type === "Literal" && typeof (node as NumericLiteral).value === "number";
}

export function isBooleanLiteral(node: Node | undefined, value?: boolean): node is BooleanLiteral {
  if (node === undefined || node.type !== "Literal" || typeof (node as BooleanLiteral).value !== "boolean") return false;
  if (value !== undefined) return (node as BooleanLiteral).value === value;
  return true;
}

export function isNullLiteral(node: Node | undefined): node is NullLiteral {
  return node !== undefined && node.type === "Literal" && (node as NullLiteral).value === null;
}

export function isParenthesizedExpression(node: Node | undefined): node is ParenthesizedExpression {
  return node !== undefined && node.type === "ParenthesizedExpression";
}

export function isVariableDeclaration(node: Node | undefined): node is VariableDeclaration {
  return node !== undefined && node.type === "VariableDeclaration";
}

export function isVariableDeclarator(node: Node | undefined): node is VariableDeclarator {
  return node !== undefined && node.type === "VariableDeclarator";
}

export function isProperty(node: Node | undefined): node is ObjectProperty {
  return node !== undefined && node.type === "Property";
}

export function isBinaryExpression(node: Node | undefined): node is BinaryExpression {
  return node !== undefined && node.type === "BinaryExpression";
}

export function isLogicalExpression(node: Node | undefined): node is LogicalExpression {
  return node !== undefined && node.type === "LogicalExpression";
}

export function isAssignmentExpression(node: Node | undefined): node is AssignmentExpression {
  return node !== undefined && node.type === "AssignmentExpression";
}

export function isIfStatement(node: Node | undefined): node is IfStatement {
  return node !== undefined && node.type === "IfStatement";
}

export function isForStatement(node: Node | undefined): node is ForStatement {
  return node !== undefined && node.type === "ForStatement";
}

export function isBlockStatement(node: Node | undefined): node is BlockStatement {
  return node !== undefined && node.type === "BlockStatement";
}

export function isReturnStatement(node: Node | undefined): node is ReturnStatement {
  return node !== undefined && node.type === "ReturnStatement";
}

export function isExpressionStatement(node: Node | undefined): node is ExpressionStatement {
  return node !== undefined && node.type === "ExpressionStatement";
}

export function isConditionalExpression(node: Node | undefined): node is ConditionalExpression {
  return node !== undefined && node.type === "ConditionalExpression";
}

export function isUnaryExpression(node: Node | undefined): node is UnaryExpression {
  return node !== undefined && node.type === "UnaryExpression";
}

export function isUpdateExpression(node: Node | undefined): node is UpdateExpression {
  return node !== undefined && node.type === "UpdateExpression";
}

export function isArrayExpression(node: Node | undefined): node is ArrayExpression {
  return node !== undefined && node.type === "ArrayExpression";
}

export function isNewExpression(node: Node | undefined): node is NewExpression {
  return node !== undefined && node.type === "NewExpression";
}

export function isTSAsExpression(node: Node | undefined): node is TSAsExpression {
  return node !== undefined && node.type === "TSAsExpression";
}

export function isSpreadElement(node: Node | undefined): node is SpreadElement {
  return node !== undefined && node.type === "SpreadElement";
}

export function isAwaitExpression(node: Node | undefined): node is AwaitExpression {
  return node !== undefined && node.type === "AwaitExpression";
}

export function isTemplateLiteral(node: Node | undefined): node is TemplateLiteral {
  return node !== undefined && node.type === "TemplateLiteral";
}

export function isWhileStatement(node: Node | undefined): node is WhileStatement {
  return node !== undefined && node.type === "WhileStatement";
}

export function isDoWhileStatement(node: Node | undefined): node is DoWhileStatement {
  return node !== undefined && node.type === "DoWhileStatement";
}

export function isForOfStatement(node: Node | undefined): node is ForOfStatement {
  return node !== undefined && node.type === "ForOfStatement";
}

export function isForInStatement(node: Node | undefined): node is ForInStatement {
  return node !== undefined && node.type === "ForInStatement";
}

export function isSwitchStatement(node: Node | undefined): node is SwitchStatement {
  return node !== undefined && node.type === "SwitchStatement";
}

export function isTryStatement(node: Node | undefined): node is TryStatement {
  return node !== undefined && node.type === "TryStatement";
}

export function isThrowStatement(node: Node | undefined): node is ThrowStatement {
  return node !== undefined && node.type === "ThrowStatement";
}

export function isContinueStatement(node: Node | undefined): node is ContinueStatement {
  return node !== undefined && node.type === "ContinueStatement";
}

export function isBreakStatement(node: Node | undefined): node is BreakStatement {
  return node !== undefined && node.type === "BreakStatement";
}

export function isFunctionExpression(node: Node | undefined): node is FunctionExpression {
  return node !== undefined && node.type === "FunctionExpression";
}

export function isTSNonNullExpression(node: Node | undefined): node is TSNonNullExpression {
  return node !== undefined && node.type === "TSNonNullExpression";
}

export function isExportNamedDeclaration(node: Node | undefined): node is ExportNamedDeclaration {
  return node !== undefined && node.type === "ExportNamedDeclaration";
}

export function nodeTextOf(source: string, node: Node): string {
  return source.slice(node.start, node.end);
}

export function getMemberObject(member: MemberExpression): Node {
  return member.object;
}

export function getMemberProperty(member: MemberExpression): Node {
  return member.property;
}

export function getMemberPropertyName(source: string, member: MemberExpression): string {
  if (isStaticMemberExpression(member)) return member.property.name;
  return source.slice(member.property.start, member.property.end);
}

export function getCallFirstArg(call: CallExpression): Node | undefined {
  return call.arguments[0];
}

export function getCallArgIdentifier(call: CallExpression, index: number): string | undefined {
  const arg = call.arguments[index];
  return isIdentifier(arg) ? arg.name : undefined;
}

export function getCallArgStringLiteral(call: CallExpression, index: number): string | undefined {
  const arg = call.arguments[index];
  return isStringLiteral(arg) ? arg.value : undefined;
}

export function getCallArgText(source: string, call: CallExpression, index: number): string | undefined {
  const arg = call.arguments[index];
  return arg !== undefined ? source.slice(arg.start, arg.end) : undefined;
}

export function identifierName(node: Identifier): string {
  return node.name;
}

export function calleeIsIdentifier(call: CallExpression): string | undefined {
  return isIdentifier(call.callee) ? call.callee.name : undefined;
}

export function calleeIsBsMethod(source: string, call: CallExpression): string | undefined {
  if (!isMemberExpression(call.callee)) return undefined;
  if (!isIdentifier(call.callee.object)) return undefined;
  if (call.callee.object.name !== "bs") return undefined;
  return getMemberPropertyName(source, call.callee);
}

export function calleeMethod(source: string, call: CallExpression): string | undefined {
  if (!isMemberExpression(call.callee)) return undefined;
  return getMemberPropertyName(source, call.callee);
}

export function getObjectProperty(obj: ObjectExpression, name: string): Node | undefined {
  for (const prop of obj.properties) {
    if (isProperty(prop) && isIdentifier(prop.key) && prop.key.name === name) {
      return prop.value;
    }
  }
  return undefined;
}

export function getObjectPropertyString(obj: ObjectExpression, name: string): string | undefined {
  const value = getObjectProperty(obj, name);
  if (value !== undefined && isStringLiteral(value)) return value.value;
  return undefined;
}

export function getPropertyName(prop: Node): string | undefined {
  if (isProperty(prop) && isIdentifier(prop.key)) return prop.key.name;
  return undefined;
}

export function getPropertyStringValue(prop: Node): string | undefined {
  if (!isProperty(prop)) return undefined;
  if (isStringLiteral(prop.value)) return prop.value.value;
  return undefined;
}

export function unwrapParenthesized(node: Node): Node {
  while (isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return node;
}

export function unwrapMethodChain(source: string, node: Node): CallExpression | undefined {
  if (!isCallExpression(node)) return undefined;
  if (isMemberExpression(node.callee)) {
    if (isCallExpression(node.callee.object)) {
      return unwrapMethodChain(source, node.callee.object);
    }
  }
  return node;
}

export function unwrapChainedMethod(source: string, call: CallExpression): string | undefined {
  if (!isMemberExpression(call.callee)) return undefined;
  const inner = call.callee.object;
  if (!isCallExpression(inner)) return undefined;
  return calleeIsBsMethod(source, inner) ?? calleeMethod(source, inner);
}
