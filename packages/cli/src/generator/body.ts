import type { Node } from "oxc-parser";

import type {
  IrAccount,
  IrAccountField,
  IrInstruction,
  IrInstructionAccount,
  IrProgram,
  IrSeed,
  IrType,
} from "#ir";
import { toPascal, toSnake } from "#lib/naming";
import { CodeWriter } from "./code-writer";
import {
  isCpiSol,
  isIntegerSeedType,
  formatSeedType,
  parseBodyStatements,
} from "./body/utils";

import {
  type CallExpression,
  type MemberExpression,
  type IfStatement,
  type ForStatement,
  type AssignmentExpression,
  type ObjectExpression,
  type BinaryExpression,
  type LogicalExpression,
  type ConditionalExpression,
  type UnaryExpression,
  type UpdateExpression,
  type ArrayExpression,
  type NewExpression,
  type VariableDeclaration,
  isCallExpression,
  isMemberExpression,
  isIdentifier,
  isObjectExpression,
  isStringLiteral,
  isNumericLiteral,
  isBooleanLiteral,
  isNullLiteral,
  isBinaryExpression,
  isLogicalExpression,
  isAssignmentExpression,
  isParenthesizedExpression,
  isTSNonNullExpression,
  isConditionalExpression,
  isArrowFunctionExpression,
  isProperty,
  isSpreadElement,
  isAwaitExpression,
  isTemplateLiteral,
  isFunctionExpression,
  isNewExpression,
  isArrayExpression,
  isTSAsExpression,
  isIfStatement,
  isForStatement,
  isBlockStatement,
  isReturnStatement,
  isExpressionStatement,
  isUnaryExpression,
  isUpdateExpression,
  isContinueStatement,
  isBreakStatement,
  isWhileStatement,
  isDoWhileStatement,
  isForOfStatement,
  isForInStatement,
  isSwitchStatement,
  isTryStatement,
  isThrowStatement,
  isVariableDeclaration,
  isVariableDeclarator,
  getObjectProperty,
  nodeTextOf,
} from "../parser/node-helpers";

type SymbolInfo = {
  readonly kind: "account";
  readonly sourceName: string;
  readonly rustName: string;
  readonly account: IrInstructionAccount;
  readonly accountDef: IrAccount | undefined;
} | {
  readonly kind: "arg";
  readonly sourceName: string;
  readonly rustName: string;
  readonly type: IrType;
} | {
  readonly kind: "local";
  readonly sourceName: string;
  readonly rustName: string;
  readonly type: IrType | undefined;
};

type InferredType = {
  readonly kind: "value";
  readonly type: IrType;
  readonly zeroCopyBool: boolean;
} | {
  readonly kind: "account";
  readonly symbol: SymbolInfo & { readonly kind: "account" };
} | {
  readonly kind: "remaining";
} | {
  readonly kind: "accountObject";
} | {
  readonly kind: "argsObject";
};

type ExpressionMode = "value" | "condition" | "pubkey";

type AssignmentOperator = "=" | "+=" | "-=" | "*=" | "/=";

type CpiCall = {
  readonly moduleName: "token" | "token_interface";
  readonly functionName: "transfer" | "transfer_checked" | "mint_to" | "burn";
  readonly accountsType: "Transfer" | "TransferChecked" | "MintTo" | "Burn";
  readonly accounts: readonly CpiAccountField[];
  readonly amount: Node;
  readonly decimals: Node | undefined;
  readonly authority: Node;
};

type CpiAccountField = {
  readonly name: string;
  readonly expression: Node;
};

export function transpileBody(ix: IrInstruction, program: IrProgram): string {
  const { statements, params, source } = parseBodyStatements(ix.body);
  const context = new BodyContext(ix, program, statements, params, source);
  return context.transpile();
}

const ASSIGNMENT_OPS = new Set(["=", "+=", "-=", "*=", "/="]);

class BodyContext {
  private readonly symbols = new Map<string, SymbolInfo>();
  private readonly locals = new Map<string, SymbolInfo & { readonly kind: "local" }>();
  private readonly mutatedLocals = new Set<string>();
  private readonly mutatedAccounts = new Set<string>();
  private readonly deferredInitializers = new Set<string>();
  private readonly elementAliases = new Map<string, MemberExpression>();
  private readonly referencedAccounts = new Set<string>();
  private cpiIndex = 0;
  private remainingWriteIndex = 0;

  private readonly accountObjectAlias: string | undefined;
  private readonly argsObjectAlias: string | undefined;
  private readonly contextObjectAlias: string | undefined;
  private readonly source: string;

  constructor(
    private readonly ix: IrInstruction,
    private readonly program: IrProgram,
    private readonly statements: readonly Node[],
    params: readonly Node[],
    source: string,
  ) {
    const aliases = resolveRunParamAliases(ix, params);
    this.accountObjectAlias = aliases.accountObjectAlias;
    this.argsObjectAlias = aliases.argsObjectAlias;
    this.contextObjectAlias = aliases.contextObjectAlias;
    this.source = source;
    for (const account of ix.accounts) {
      this.symbols.set(account.name, {
        kind: "account",
        sourceName: account.name,
        rustName: toSnake(account.name),
        account,
        accountDef: this.resolveAccountDef(account),
      });
    }

    for (const arg of ix.args) {
      this.symbols.set(arg.name, {
        kind: "arg",
        sourceName: arg.name,
        rustName: toSnake(arg.name),
        type: arg.type,
      });
    }

    this.collectLocalsAndReferences();
  }

  transpile(): string {
    const cw = new CodeWriter();
    cw.indent(2);

    for (const account of this.ix.accounts) {
      if (!this.shouldBindAccount(account)) continue;
      cw.line(this.renderAccountBinding(account));
    }

    if (this.hasAccountBindings()) cw.blank();

    for (const statement of this.statements) {
      this.writeStatement(cw, statement);
    }

    if (this.statements.length > 0) cw.blank();
    return cw.toString();
  }

  private collectLocalsAndReferences(): void {
    const visit = (node: Node): void => {
      if (isVariableDeclaration(node) && (node.kind === "const" || node.kind === "let")) {
        for (const decl of node.declarations) {
          if (!isVariableDeclarator(decl) || !isIdentifier(decl.id)) continue;
          const name = decl.id.name;
          const initializer = decl.init ?? undefined;
          const inferred = this.inferExpressionType(initializer);
          const local = {
            kind: "local" as const,
            sourceName: name,
            rustName: toSnake(name),
            type: inferred?.kind === "value" ? inferred.type : undefined,
          };
          this.locals.set(name, local);
          this.symbols.set(name, local);
        }
      }

      if (isMemberExpression(node) && isIdentifier(node.object) && node.object.name === this.accountObjectAlias) {
        const accountName = memberPropertyName(node);
        if (this.ix.accounts.some((account) => account.name === accountName)) this.referencedAccounts.add(accountName);
      }

      if (isIdentifier(node)) {
        const symbol = this.symbols.get(node.name);
        if (symbol?.kind === "account" && !this.isPropertyName(node)) {
          this.referencedAccounts.add(symbol.sourceName);
        }
      }

      if (isAssignmentExpression(node)) {
        this.collectMutatedAccounts(node.left);
        if (isIdentifier(node.left)) this.mutatedLocals.add(node.left.name);
        if (isMemberExpression(node.left) && isIdentifier(node.left.object)) this.mutatedLocals.add(node.left.object.name);
      }

      if (isUpdateExpression(node) && isIdentifier(node.argument)) {
        this.mutatedLocals.add(node.argument.name);
      }

      for (const child of childrenOf(node)) visit(child);
    };

    for (const statement of this.statements) visit(statement);
    this.collectDeferredInitializers(this.statements);
  }

  private collectMutatedAccounts(node: Node): void {
    if (isIdentifier(node) && !this.isPropertyName(node)) {
      const symbol = this.symbols.get(node.name);
      if (symbol?.kind === "account") this.mutatedAccounts.add(symbol.sourceName);
    }
    if (isMemberExpression(node) && isIdentifier(node.object) && node.object.name === this.accountObjectAlias) {
      const accountName = memberPropertyName(node);
      if (this.ix.accounts.some((a) => a.name === accountName)) this.mutatedAccounts.add(accountName);
    }
    for (const child of childrenOf(node)) this.collectMutatedAccounts(child);
  }

  private collectDeferredInitializers(statements: readonly Node[]): void {
    for (let i = 0; i < statements.length - 1; i++) {
      const statement = statements[i]!;
      const next = statements[i + 1];
      if (!isVariableDeclaration(statement) || !isIfStatement(next)) continue;
      for (const decl of statement.declarations) {
        if (!isVariableDeclarator(decl) || !isIdentifier(decl.id)) continue;
        const initializer = decl.init ?? undefined;
        if (initializer === undefined || initializer === null || !this.isZeroLiteral(initializer)) continue;
        const name = decl.id.name;
        const alternate = next.alternate;
        if (alternate === undefined || alternate === null) continue;
        if (this.statementAssignsTo(next.consequent, name) && this.statementAssignsTo(alternate, name)) {
          this.deferredInitializers.add(name);
        }
      }
    }
  }

  private statementAssignsTo(statement: Node, name: string): boolean {
    const stmts = isBlockStatement(statement) ? statement.body : [statement];
    return stmts.some((candidate) => {
      if (!isExpressionStatement(candidate)) return false;
      const expression = candidate.expression;
      if (!isAssignmentExpression(expression) || expression.operator !== "=") return false;
      return isIdentifier(expression.left) && expression.left.name === name;
    });
  }

  private isZeroLiteral(node: Node): boolean {
    return isNumericLiteral(node) && node.value === 0;
  }

  private hasAccountBindings(): boolean {
    return this.ix.accounts.some((account) => this.shouldBindAccount(account));
  }

  private shouldBindAccount(account: IrInstructionAccount): boolean {
    if (!this.referencedAccounts.has(account.name)) return false;
    const kind = account.constraint.kind;
    return kind !== "remaining" && kind !== "tokenProgram" && kind !== "token2022Program" && kind !== "systemProgram" && kind !== "clock";
  }

  private renderAccountBinding(account: IrInstructionAccount): string {
    const rustName = toSnake(account.name);
    const accountDef = this.resolveAccountDef(account);
    if (accountDef?.zeroCopy === true) {
      return this.isMutableAccount(account) && this.mutatedAccounts.has(account.name)
        ? `let mut ${rustName} = ctx.accounts.${rustName}.load_mut()?;`
        : `let ${rustName} = ctx.accounts.${rustName}.load()?;`;
    }

    return this.isMutableAccount(account)
      ? `let ${rustName} = &mut ctx.accounts.${rustName};`
      : `let ${rustName} = &ctx.accounts.${rustName};`;
  }

  private writeStatement(cw: CodeWriter, statement: Node): void {
    if (isVariableDeclaration(statement)) {
      for (const line of this.renderVariableStatement(statement)) cw.line(line);
      return;
    }

    if (isExpressionStatement(statement)) {
      for (const line of this.renderExpressionStatement(statement)) cw.line(line);
      return;
    }

    if (isIfStatement(statement)) {
      this.writeIfStatement(cw, statement);
      return;
    }

    if (isForStatement(statement)) {
      this.writeForStatement(cw, statement);
      return;
    }

    if (isContinueStatement(statement)) {
      cw.line("continue;");
      return;
    }

    if (isBreakStatement(statement)) {
      cw.line("break;");
      return;
    }

    if (isReturnStatement(statement)) {
      const returnExpr = statement.argument ?? undefined;
      if (returnExpr !== undefined) {
        cw.line(`return Ok(${this.renderExpression(returnExpr, "value")});`);
      } else {
        cw.line("return Ok(());");
      }
      return;
    }

    if (isForOfStatement(statement) || isForInStatement(statement)) this.unsupported("for...of/for...in loops", statement, "Use a bounded index loop: for (let i = 0; i < limit; i++). On-chain programs need explicit bounds.");
    if (isWhileStatement(statement) || isDoWhileStatement(statement)) this.unsupported("while/do loops", statement, "Use a bounded for loop: for (let i = 0; i < limit; i++). On-chain programs need explicit bounds.");
    if (isSwitchStatement(statement)) this.unsupported("switch statements", statement, "Use explicit if/else branches.");
    if (isTryStatement(statement)) this.unsupported("try/catch/finally", statement, "Use ctx.require(...) and Result-returning supported operations instead.");
    if (isThrowStatement(statement)) this.unsupported("throw statements", statement, "Use ctx.require(condition, 'ErrorName') with inline program errors.");

    if (isBlockStatement(statement)) {
      for (const nested of statement.body) this.writeStatement(cw, nested);
      return;
    }

    this.unsupported(`statement syntax '${statement.type}'`, statement);
  }

  private renderVariableStatement(statement: VariableDeclaration): readonly string[] {
    const lines: string[] = [];
    for (const decl of statement.declarations) {
      if (!isVariableDeclarator(decl) || !isIdentifier(decl.id)) {
        this.unsupported("destructuring variable declarations", decl, "Declare each local explicitly instead of using object/array destructuring.");
      }
      const name = decl.id.name;
      const rustName = toSnake(name);
      const init = decl.init ?? undefined;
      const mutable = this.mutatedLocals.has(name) && !this.deferredInitializers.has(name);
      const keyword = mutable ? "let mut" : "let";
      if (init === undefined || init === null || this.deferredInitializers.has(name)) {
        lines.push(`${keyword} ${rustName};`);
        continue;
      }
      const inferred = this.inferExpressionType(init);
      const local = this.locals.get(name);
      if (local !== undefined && inferred?.kind === "value") {
        const updated = { ...local, type: inferred.type };
        this.locals.set(name, updated);
        this.symbols.set(name, updated);
      }
      if (isConditionalExpression(init) && this.mutatedLocals.has(name)) {
        throw new Error(`Instruction '${this.ix.name}' creates a mutable conditional alias '${name}'. Rewrite it as explicit branches so generated Rust preserves account mutations.`);
      }
      if (isMemberExpression(init) && init.computed && this.mutatedLocals.has(name)) {
        this.elementAliases.set(name, init);
        continue;
      }
      lines.push(`${keyword} ${rustName} = ${this.renderExpression(init, "value", inferred?.kind === "value" ? inferred.type : undefined)};`);
    }
    return lines;
  }

  private renderExpressionStatement(expression: Node): readonly string[] {
    if (!isExpressionStatement(expression)) return [];

    const expr = expression.expression;
    const cpi = this.tryParseCpiCall(expr);
    if (cpi !== undefined) return this.renderCpiCall(cpi);

    if (isCallExpression(expr)) {
      const requireLine = this.tryRenderRequire(expr);
      if (requireLine !== undefined) return [requireLine];
      const emitLine = this.tryRenderEmit(expr);
      if (emitLine !== undefined) return [emitLine];
      const logLine = this.tryRenderLog(expr);
      if (logLine !== undefined) return [logLine];
    }

    if (isAssignmentExpression(expr) && ASSIGNMENT_OPS.has(expr.operator)) {
      const remainingAssignment = this.tryRenderRemainingAssignment(expr);
      if (remainingAssignment !== undefined) return remainingAssignment;
      const indexedAssignment = this.tryRenderIndexedAssignment(expr);
      if (indexedAssignment !== undefined) return indexedAssignment;
      return [this.renderAssignment(expr)];
    }

    return [`${this.renderExpression(expr, "value")};`];
  }

  private writeIfStatement(cw: CodeWriter, statement: IfStatement): void {
    const condition = this.renderExpression(statement.test, "condition");
    cw.block(`if ${condition}`, () => {
      this.writeNestedStatement(cw, statement.consequent);
    });
    const alternate = statement.alternate;
    if (alternate === undefined || alternate === null) return;
    cw.block("else", () => {
      this.writeNestedStatement(cw, alternate);
    });
  }

  private writeForStatement(cw: CodeWriter, statement: ForStatement): void {
    const init = statement.init;
    const test = statement.test;
    if (init === undefined || init === null || test === undefined || test === null) {
      this.unsupported("for loops without initializer or condition", statement, "Use: for (let i = 0; i < limit; i++). ");
    }

    const loopVariable = this.getForLoopVariable(init);
    const start = this.getForLoopStart(init);
    const end = this.getForLoopEnd(test);
    if (loopVariable === undefined || start === undefined || end === undefined) {
      this.unsupported("unsupported for-loop shape", statement, "Use the supported shape: for (let i = 0; i < limit; i++). ");
    }

    const local = {
      kind: "local" as const,
      sourceName: loopVariable,
      rustName: toSnake(loopVariable),
      type: "u64" as IrType,
    };
    this.locals.set(loopVariable, local);
    this.symbols.set(loopVariable, local);

    cw.block(`for ${toSnake(loopVariable)} in ${start}..(${end} as usize)`, () => {
      this.writeNestedStatement(cw, statement.body);
    });
  }

  private writeNestedStatement(cw: CodeWriter, statement: Node): void {
    if (isBlockStatement(statement)) {
      for (const nested of statement.body) this.writeStatement(cw, nested);
      return;
    }
    this.writeStatement(cw, statement);
  }

  private tryRenderIndexedAssignment(expression: AssignmentExpression): readonly string[] | undefined {
    const left = expression.left;
    if (!isMemberExpression(left) || !left.computed) return undefined;
    const indexArg = left.property;
    const base = left.object;
    if (!isMemberExpression(base)) return undefined;
    const owner = base.object;
    if (!isIdentifier(owner)) return undefined;
    if (!this.expressionReferencesIdentifier(indexArg, owner.name)) return undefined;
    const variable = `${toSnake(owner.name)}_${toSnake(memberPropertyName(base))}_index_${this.remainingWriteIndex++}`;
    const targetType = this.inferAssignmentTargetType(left);
    const expected = targetType?.kind === "value" ? targetType.type : undefined;
    return [
      `let ${variable} = ${this.renderExpression(indexArg, "value")} as usize;`,
      `${this.renderExpression(base, "value")}[${variable}] ${expression.operator} ${this.renderExpression(expression.right, "value", expected)};`,
    ];
  }

  private expressionReferencesIdentifier(node: Node | undefined | null, name: string): boolean {
    if (node === undefined || node === null) return false;
    if (isIdentifier(node) && node.name === name) return true;
    return childrenOf(node).some((child) => this.expressionReferencesIdentifier(child, name));
  }

  private tryRenderRemainingAssignment(expression: AssignmentExpression): readonly string[] | undefined {
    if (expression.operator !== "=") return undefined;
    const left = expression.left;
    if (!isMemberExpression(left) || left.computed) return undefined;
    const rawBase = left.object;
    const base = isTSNonNullExpression(rawBase) ? rawBase.expression : rawBase;
    if (!isMemberExpression(base) || !base.computed) return undefined;
    const remainingBase = base.object;
    if (!isIdentifier(remainingBase)) return undefined;
    const symbol = this.symbols.get(remainingBase.name);
    if (symbol?.kind !== "account" || symbol.account.constraint.kind !== "remaining") return undefined;
    const accountName = symbol.account.constraint.accountName;
    if (accountName === undefined) return undefined;
    const index = base.property;
    const renderedIndex = this.renderExpression(index, "value");
    const variable = `${symbol.rustName}_item_${this.remainingWriteIndex++}`;
    const fieldName = memberPropertyName(left);
    const accountDef = this.program.accounts.find((account) => account.name === accountName);
    const field = accountDef?.fields.find((candidate) => candidate.name === fieldName);
    const expected = field?.type;
    return [
      `let mut ${variable} = Account::<${toPascal(accountName)}>::try_from(&ctx.remaining_accounts[(${renderedIndex}) as usize])?;`,
      `${variable}.${toSnake(fieldName)} = ${this.renderExpression(expression.right, "value", expected)};`,
      `${variable}.exit(ctx.program_id)?;`,
    ];
  }

  private renderAssignment(expression: AssignmentExpression): string {
    const operator = expression.operator as AssignmentOperator;
    const left = expression.left;
    const targetType = this.inferAssignmentTargetType(left);
    const right = expression.right;
    const fieldType = targetType?.kind === "value" ? targetType.zeroCopyBool ? "u8" : targetType.type : undefined;
    const renderedRight = this.renderExpression(right, "value", fieldType);
    const isOption = fieldType !== undefined && typeof fieldType === "object" && fieldType.kind === "option";
    const isNull = isNullLiteral(right);
    const wrappedRight = isOption && !isNull ? `Some(${renderedRight})` : renderedRight;
    return `${this.renderAssignmentTarget(left)} ${operator} ${wrappedRight};`;
  }

  private tryRenderRequire(expression: CallExpression): string | undefined {
    const callee = expression.callee;
    if (!isMemberExpression(callee)) return undefined;
    if (!isIdentifier(callee.object) || !this.isContextAlias(callee.object.name)) return undefined;
    if (!isIdentifier(callee.property) || callee.property.name !== "require") return undefined;
    const args = expression.arguments;
    const condition = args[0];
    const error = args[1];
    if (condition === undefined || error === undefined || !isStringLiteral(error)) return undefined;
    const errorName = error.value;
    this.assertKnownError(errorName, error);
    return `require!(${this.renderExpression(condition, "condition")}, ProgramError::${toPascal(errorName)});`;
  }

  private tryRenderEmit(expression: CallExpression): string | undefined {
    const callee = expression.callee;
    const args = expression.arguments;

    if (isMemberExpression(callee) && isIdentifier(callee.object) && this.isContextAlias(callee.object.name) && isIdentifier(callee.property) && callee.property.name === "emit") {
      const eventName = args[0];
      const payload = args[1];
      if (eventName === undefined || payload === undefined || !isStringLiteral(eventName) || !isObjectExpression(payload)) return undefined;
      const eventNameValue = eventName.value;
      const fields = this.findEventFields(eventNameValue);
      this.assertEventPayload(eventNameValue, payload, fields);
      return `emit!(${toPascal(eventNameValue)} { ${this.renderObjectFields(payload, fields)} });`;
    }

    return undefined;
  }

  private tryRenderLog(expression: CallExpression): string | undefined {
    const callee = expression.callee;
    if (!isMemberExpression(callee)) return undefined;
    if (!isIdentifier(callee.object) || !this.isContextAlias(callee.object.name)) return undefined;
    if (!isIdentifier(callee.property) || callee.property.name !== "log") return undefined;
    const args = expression.arguments;
    const message = args[0];
    if (message === undefined || !isStringLiteral(message)) return undefined;
    const renderedArgs = args.slice(1).map((arg) => this.renderExpression(arg, "value"));
    const messageText = message.value;
    const hasPlaceholders = messageText.includes("{}");
    return renderedArgs.length === 0
      ? `msg!(${JSON.stringify(messageText)});`
      : hasPlaceholders
        ? `msg!(${JSON.stringify(messageText)}, ${renderedArgs.join(", ")});`
        : `msg!("${messageText} ${renderedArgs.map(() => "{}").join(" ")}", ${renderedArgs.join(", ")});`;
  }

  private renderExpression(node: Node | undefined | null, mode: ExpressionMode, expectedType?: IrType): string {
    if (node === undefined || node === null) return "/* undefined */";
    if (isParenthesizedExpression(node)) return `(${this.renderExpression(node.expression, mode, expectedType)})`;
    if (isTSNonNullExpression(node)) return this.renderExpression(node.expression, mode, expectedType);
    if (isIdentifier(node)) return this.renderIdentifier(node.name, mode, expectedType);
    if (isNumericLiteral(node)) return String(node.value);
    if (isStringLiteral(node)) {
      if (expectedType === "pubkey" && node.value === "") return "Pubkey::default()";
      return expectedType === "string" ? `${JSON.stringify(node.value)}.to_string()` : JSON.stringify(node.value);
    }
    if (isBooleanLiteral(node, true)) return this.renderBooleanLiteral(true, expectedType);
    if (isBooleanLiteral(node, false)) return this.renderBooleanLiteral(false, expectedType);
    if (isNullLiteral(node)) return this.renderNullLiteral(expectedType);
    if (isMemberExpression(node)) return this.renderPropertyAccess(node, mode, expectedType);
    if (isBinaryExpression(node)) return this.renderBinaryExpression(node, mode, expectedType);
    if (isLogicalExpression(node)) return this.renderBinaryExpression(node, mode, expectedType);
    if (isAssignmentExpression(node) && ASSIGNMENT_OPS.has(node.operator)) return this.renderAssignmentAsExpression(node);
    if (isConditionalExpression(node)) return this.renderConditionalExpression(node, expectedType);
    if (isUnaryExpression(node)) return this.renderPrefixUnaryExpression(node, mode, expectedType);
    if (isUpdateExpression(node)) return this.renderPostfixUnaryExpression(node);
    if (isCallExpression(node)) return this.renderCallExpression(node, expectedType);
    if (isTSAsExpression(node)) return this.renderExpression(node.expression, mode, expectedType);
    if (isAwaitExpression(node)) this.unsupported("await expressions", node, "On-chain instruction logic cannot await. Move async work to the client/off-chain code.");
    if (isTemplateLiteral(node)) this.unsupported("template string expressions", node, "Use string literals only in supported log/message contexts.");
    if (isSpreadElement(node)) this.unsupported("spread expressions", node, "Write fields or array elements explicitly.");
    if (isArrowFunctionExpression(node) || isFunctionExpression(node)) this.unsupported("nested functions", node, "Inline the logic or move it into a supported DSL primitive.");
    if (isNewExpression(node)) return this.renderNewExpression(node, expectedType);
    if (isObjectExpression(node)) return this.renderObjectLiteral(node, expectedType);
    if (isArrayExpression(node)) return this.renderArrayLiteral(node, expectedType);

    if (node.type === "Literal" && "bigint" in node) {
      const raw = (node as { readonly raw: string | null }).raw;
      return raw !== null ? raw.replace(/n$/, "") : "0";
    }

    this.unsupported(`expression syntax '${node.type}'`, node);
  }

  private renderIdentifier(name: string, mode: ExpressionMode, expectedType?: IrType): string {
    const symbol = this.symbols.get(name);
    if (symbol === undefined) this.unsupported(`identifier '${name}'`, undefined, "Only instruction accounts, instruction args, and locals declared inside run(...) are available in on-chain logic. Inline constants or pass them as instruction args.");
    if (symbol.kind === "account") {
      if (mode === "pubkey" || expectedType === "pubkey") return this.renderAccountKey(symbol);
      return symbol.rustName;
    }
    const inferred = symbol.type !== undefined ? { kind: "value" as const, type: symbol.type, zeroCopyBool: false } : undefined;
    return this.coerceRendered(symbol.rustName, inferred, expectedType);
  }

  private renderPropertyAccess(node: MemberExpression, mode: ExpressionMode, expectedType?: IrType): string {
    const rawBase = node.object;
    const base = isIdentifier(rawBase) ? (this.elementAliases.get(rawBase.name) ?? rawBase) : rawBase;
    const property = memberPropertyName(node);
    const baseType = this.inferExpressionType(base);

    if (baseType?.kind === "accountObject") return this.renderObjectAliasProperty("accounts", property, mode, expectedType, node);
    if (baseType?.kind === "argsObject") return this.renderObjectAliasProperty("args", property, mode, expectedType, node);

    if (property === "length" && baseType?.kind === "remaining") return "ctx.remaining_accounts.len() as u64";

    if (property === "key" && baseType?.kind === "account") return this.renderAccountKey(baseType.symbol);

    if (isCpiSol(base) && property === "timestamp") return "Clock::get()?.unix_timestamp";

    if (baseType?.kind === "account" && baseType.symbol.account.constraint.kind === "clock") {
      return `ctx.accounts.${baseType.symbol.rustName}.${toSnake(property)}`;
    }

    this.assertKnownProperty(baseType, property, node);
    const renderedBase = this.renderExpression(base, "value");
    const renderedProperty = this.renderFieldName(baseType, property);
    const value = `${renderedBase}.${renderedProperty}`;

    const inferred = this.inferPropertyType(baseType, property);
    if (mode === "condition" && this.isZeroCopyBoolField(baseType, property)) return `${value} != 0`;
    if (expectedType === "pubkey" && inferred?.kind === "account") return `${value}.key()`;
    return this.coerceRendered(value, inferred, expectedType);
  }

  private isContextAlias(name: string): boolean {
    return name === "ctx" || name === this.contextObjectAlias;
  }

  private renderObjectAliasProperty(kind: "accounts" | "args", property: string, mode: ExpressionMode, expectedType: IrType | undefined, node: Node): string {
    if (kind === "accounts") {
      if (!this.ix.accounts.some((account) => account.name === property)) {
        this.unsupported(`unknown account alias property '${property}'`, node, `Use one of: ${this.ix.accounts.map((account) => account.name).join(", ") || "none"}.`);
      }
      return this.renderIdentifier(property, mode, expectedType);
    }

    if (!this.ix.args.some((arg) => arg.name === property)) {
      this.unsupported(`unknown args alias property '${property}'`, node, `Use one of: ${this.ix.args.map((arg) => arg.name).join(", ") || "none"}.`);
    }
    return this.renderIdentifier(property, mode, expectedType);
  }

  private renderBinaryExpression(node: BinaryExpression | LogicalExpression, mode: ExpressionMode, expectedType?: IrType): string {
    const operator = this.renderBinaryOperator(node.operator);
    const left = node.left;
    const right = node.right;
    if (operator === "==" || operator === "!=") {
      const leftExpected = this.shouldCoerceToPubkey(left, right) ? "pubkey" : undefined;
      const rightExpected = this.shouldCoerceToPubkey(right, left) ? "pubkey" : undefined;
      return `${this.renderExpression(left, "value", leftExpected)} ${operator} ${this.renderExpression(right, "value", rightExpected)}`;
    }
    const commonType = this.commonNumericType(left, right, expectedType);
    const leftRendered = this.renderExpression(left, "value", commonType);
    const rightRendered = this.renderExpression(right, "value", commonType);
    const rendered = `${this.wrapCastOperand(leftRendered)} ${operator} ${this.wrapCastOperand(rightRendered)}`;
    if (mode === "condition") return rendered;
    return this.coerceRendered(rendered, this.inferExpressionType(node), expectedType);
  }

  private renderAssignmentAsExpression(node: AssignmentExpression): string {
    const leftStr = this.renderAssignmentTarget(node.left);
    const rightStr = this.renderExpression(node.right, "value");
    return `${leftStr} ${node.operator} ${rightStr}`;
  }

  private renderConditionalExpression(node: ConditionalExpression, expectedType?: IrType): string {
    return `if ${this.renderExpression(node.test, "condition")} { ${this.renderExpression(node.consequent, "value", expectedType)} } else { ${this.renderExpression(node.alternate, "value", expectedType)} }`;
  }

  private renderPrefixUnaryExpression(node: UnaryExpression, mode: ExpressionMode, expectedType?: IrType): string {
    const operand = this.renderExpression(node.argument, mode, expectedType);
    if (node.operator === "!") return `!${operand}`;
    if (node.operator === "-") return `-${operand}`;
    if (node.operator === "+") return operand;
    return `${node.operator}${operand}`;
  }

  private renderPostfixUnaryExpression(node: UpdateExpression): string {
    const operand = this.renderAssignmentTarget(node.argument);
    if (node.operator === "++") return `${operand} += 1`;
    if (node.operator === "--") return `${operand} -= 1`;
    return `${operand}`;
  }

  private renderCallExpression(node: CallExpression, expectedType?: IrType): string {
    const expression = node.callee;
    if (isMemberExpression(expression)) {
      const method = memberPropertyName(expression);
      if (isCpiSol(expression.object) && method === "timestamp") {
        return expectedType === "u64" ? "Clock::get()?.unix_timestamp as u64" : "Clock::get()?.unix_timestamp";
      }
      if (method === "abs") return this.coerceRendered(`${this.renderExpression(expression.object, "value")}.abs()`, this.inferExpressionType(expression.object), expectedType);
    }
    this.unsupported(`function call '${nodeTextOf(this.source, node.callee)}'`, node, "Supported calls are ctx.require, ctx.emit, ctx.log, sol.timestamp(), .abs(), and token CPI helpers.");
  }

  private renderNewExpression(node: NewExpression, expectedType?: IrType): string {
    const expression = nodeTextOf(this.source, node.callee);
    if (expression === "Uint8Array") {
      const arg = node.arguments[0];
      if (arg !== undefined && isArrayExpression(arg)) {
        return `vec![${arg.elements.map((el) => `${this.renderExpression(el, "value")}u8`).join(", ")}]`;
      }
      return "Vec::new()";
    }
    void expectedType;
    this.unsupported(`constructor '${expression}'`, node, "Only new Uint8Array([...]) is supported in instruction bodies.");
  }

  private renderObjectLiteral(node: ObjectExpression, expectedType?: IrType): string {
    if (expectedType !== undefined && typeof expectedType !== "string" && expectedType.kind === "struct_zc_ref") {
      const struct = this.program.structsZC.find((candidate) => candidate.name === expectedType.name);
      const fields = this.renderObjectFields(node, struct?.fields ?? []);
      return `${toPascal(expectedType.name)} { ${fields}, ..Default::default() }`;
    }
    return `{ ${this.renderObjectFields(node, [])} }`;
  }

  private renderArrayLiteral(node: ArrayExpression, expectedType?: IrType): string {
    const values = node.elements.map((element) => element !== null ? this.renderExpression(element, "value") : "/* null */").join(", ");
    if (expectedType === "bytes") return `vec![${values}]`;
    return `[${values}]`;
  }

  private renderObjectFields(node: ObjectExpression, fields: readonly IrAccountField[]): string {
    return node.properties.map((property) => {
      if (isProperty(property) && property.shorthand) {
        const name = memberPropertyName(property);
        const fieldType = fields.find((field) => field.name === name)?.type;
        return `${toSnake(name)}: ${this.renderIdentifier(name, "value", fieldType)}`;
      }
      if (isProperty(property) && !property.shorthand) {
        const name = isIdentifier(property.key) ? property.key.name.replace(/^['"]|['"]$/g, "") : nodeTextOf(this.source, property.key);
        const initializer = property.value;
        const fieldType = fields.find((field) => field.name === name)?.type;
        return `${toSnake(name)}: ${this.renderExpression(initializer, "value", fieldType)}`;
      }
      if (isSpreadElement(property)) this.unsupported("object spread", property, "Write every object field explicitly.");
      this.unsupported(`object literal property '${property.type}'`, property);
    }).join(", ");
  }

  private renderAssignmentTarget(node: Node): string {
    if (isIdentifier(node)) return this.renderIdentifier(node.name, "value");
    if (isTSNonNullExpression(node)) return this.renderAssignmentTarget(node.expression);
    if (isMemberExpression(node)) {
      const rawBase = node.object;
      const aliasedBase = isIdentifier(rawBase) ? (this.elementAliases.get(rawBase.name) ?? rawBase) : rawBase;
      const base = this.renderExpression(aliasedBase, "value");
      const baseType = this.inferExpressionType(aliasedBase);
      const property = memberPropertyName(node);
      this.assertKnownProperty(baseType, property, node);
      return `${base}.${this.renderFieldName(baseType, property)}`;
    }
    this.unsupported(`assignment target '${node.type}'`, node);
  }

  private tryParseCpiCall(expression: Node): CpiCall | undefined {
    if (!isCallExpression(expression)) return undefined;
    const callee = expression.callee;
    if (!isMemberExpression(callee)) return undefined;
    const calleeBase = callee.object;
    const isTokenCall = isMemberExpression(calleeBase) && isIdentifier(calleeBase.object) && calleeBase.object.name === "cpi" && isIdentifier(calleeBase.property) && calleeBase.property.name === "token";
    if (!isTokenCall) return undefined;
    const arg = expression.arguments[0];
    if (arg === undefined || !isObjectExpression(arg)) return undefined;

    const usesToken2022 = this.ix.accounts.some((account) => account.constraint.kind === "token2022Program");
    const method = memberPropertyName(callee);
    const moduleName = usesToken2022 ? "token_interface" : "token";

    if (method === "transfer") {
      const from = this.requireObjectExpression(arg, "from");
      const to = this.requireObjectExpression(arg, "to");
      const authority = this.requireObjectExpression(arg, "authority");
      const amount = this.requireObjectExpression(arg, "amount");
      return {
        moduleName,
        functionName: "transfer",
        accountsType: "Transfer",
        accounts: [{ name: "from", expression: from }, { name: "to", expression: to }, { name: "authority", expression: authority }],
        amount,
        decimals: undefined,
        authority,
      };
    }

    if (method === "transferChecked") {
      const from = this.requireObjectExpression(arg, "from");
      const mint = this.requireObjectExpression(arg, "mint");
      const to = this.requireObjectExpression(arg, "to");
      const authority = this.requireObjectExpression(arg, "authority");
      const amount = this.requireObjectExpression(arg, "amount");
      const decimals = this.requireObjectExpression(arg, "decimals");
      return {
        moduleName,
        functionName: "transfer_checked",
        accountsType: "TransferChecked",
        accounts: [{ name: "from", expression: from }, { name: "mint", expression: mint }, { name: "to", expression: to }, { name: "authority", expression: authority }],
        amount,
        decimals,
        authority,
      };
    }

    if (method === "mintTo") {
      const mint = this.requireObjectExpression(arg, "mint");
      const to = this.requireObjectExpression(arg, "to");
      const authority = this.requireObjectExpression(arg, "authority");
      const amount = this.requireObjectExpression(arg, "amount");
      return {
        moduleName,
        functionName: "mint_to",
        accountsType: "MintTo",
        accounts: [{ name: "mint", expression: mint }, { name: "to", expression: to }, { name: "authority", expression: authority }],
        amount,
        decimals: undefined,
        authority,
      };
    }

    if (method === "burn") {
      const from = this.requireObjectExpression(arg, "from");
      const mint = this.requireObjectExpression(arg, "mint");
      const authority = this.requireObjectExpression(arg, "authority");
      const amount = this.requireObjectExpression(arg, "amount");
      return {
        moduleName,
        functionName: "burn",
        accountsType: "Burn",
        accounts: [{ name: "mint", expression: mint }, { name: "from", expression: from }, { name: "authority", expression: authority }],
        amount,
        decimals: undefined,
        authority,
      };
    }

    return undefined;
  }

  private renderCpiCall(cpi: CpiCall): readonly string[] {
    const authority = this.inferExpressionType(cpi.authority);
    const signerSeedAccount = authority?.kind === "account" && authority.symbol.account.constraint.kind !== "signer"
      ? authority.symbol
      : undefined;
    const index = this.cpiIndex++;
    const programAccount = cpi.moduleName === "token_interface" ? "token2022Program" : "tokenProgram";
    const programRustName = toSnake(this.ix.accounts.find((account) => account.name === programAccount || account.constraint.kind === (cpi.moduleName === "token_interface" ? "token2022Program" : "tokenProgram"))?.name ?? programAccount);
    const callIndent = signerSeedAccount === undefined ? "" : "    ";
    const accountFields = cpi.accounts.map((field) => `${callIndent}            ${field.name}: ${this.renderAccountInfoExpression(field.expression)},`);
    const args = [
      `${callIndent}${cpi.moduleName}::${cpi.functionName}(`,
      signerSeedAccount === undefined
        ? `${callIndent}    CpiContext::new(`
        : `${callIndent}    CpiContext::new_with_signer(`,
      `${callIndent}        ctx.accounts.${programRustName}.to_account_info(),`,
      `${callIndent}        ${cpi.accountsType} {`,
      ...accountFields,
      `${callIndent}        },`,
    ];

    if (signerSeedAccount !== undefined) args.push(`${callIndent}        signer_seeds_${index},`);
    args.push(`${callIndent}    ),`);
    args.push(`${callIndent}    ${this.renderExpression(cpi.amount, "value", "u64")},`);
    if (cpi.decimals !== undefined) args.push(`${callIndent}    ${this.renderExpression(cpi.decimals, "value")},`);
    args.push(`${callIndent})?;`);

    if (signerSeedAccount === undefined) return args;

    return ["{", ...this.renderSignerSeeds(signerSeedAccount, index), ...args, "}"];
  }

  private renderSignerSeeds(symbol: SymbolInfo & { readonly kind: "account" }, index: number): readonly string[] {
    const account = symbol.accountDef;
    if (account === undefined || account.seeds.length === 0) return [];
    const seedLines: string[] = [];
    const seedRefs: string[] = [];

    for (const seed of account.seeds) {
      const seedExpr = this.renderSignerSeed(symbol, seed, index, seedLines);
      seedRefs.push(seedExpr);
    }

    const bumpName = `${symbol.rustName}_bump_${index}`;
    seedLines.push(`    let ${bumpName} = [ctx.bumps.${symbol.rustName}];`);
    seedRefs.push(`${bumpName}.as_ref()`);
    seedLines.push(`    let ${symbol.rustName}_seeds_${index}: &[&[u8]] = &[${seedRefs.join(", ")}];`);
    seedLines.push(`    let signer_seeds_${index}: &[&[&[u8]]] = &[${symbol.rustName}_seeds_${index}];`);
    return seedLines;
  }

  private renderSignerSeed(symbol: SymbolInfo & { readonly kind: "account" }, seed: IrSeed, index: number, seedLines: string[]): string {
    if (seed.kind === "literal") return `b"${seed.value}"`;
    const field = symbol.accountDef?.fields.find((candidate) => candidate.name === seed.fieldName);
    if (field === undefined) throw new Error(`Unknown PDA signer seed field '${seed.fieldName}' for account '${symbol.sourceName}'.`);
    const fieldAccess = `${symbol.rustName}.${toSnake(seed.fieldName)}`;
    if (field.type === "pubkey") return `${fieldAccess}.as_ref()`;
    if (!isIntegerSeedType(field.type)) throw new Error(`Unsupported PDA signer seed type '${formatSeedType(field.type)}'. PDA field seeds must be pubkey or integer values.`);
    const bytesName = `${symbol.rustName}_${toSnake(seed.fieldName)}_seed_${index}`;
    seedLines.push(`    let ${bytesName} = ${fieldAccess}.to_le_bytes();`);
    return `${bytesName}.as_ref()`;
  }

  private renderAccountInfoExpression(expression: Node): string {
    if (isIdentifier(expression)) {
      const symbol = this.symbols.get(expression.name);
      if (symbol?.kind === "account" && symbol.accountDef?.zeroCopy === true) return `ctx.accounts.${symbol.rustName}.to_account_info()`;
      if (symbol !== undefined) return `${symbol.rustName}.to_account_info()`;
    }
    const baseType = this.inferExpressionType(expression);
    if (baseType?.kind === "account") {
      const symbol = baseType.symbol;
      if (symbol.accountDef?.zeroCopy === true) return `ctx.accounts.${symbol.rustName}.to_account_info()`;
      return `${symbol.rustName}.to_account_info()`;
    }
    return `${this.renderExpression(expression, "value")}.to_account_info()`;
  }

  private requireObjectExpression(obj: ObjectExpression, name: string): Node {
    const property = getObjectProperty(obj, name);
    if (property !== undefined) return property;
    for (const prop of obj.properties) {
      if (isProperty(prop) && prop.shorthand && isIdentifier(prop.key) && prop.key.name === name) {
        return prop.key;
      }
    }
    throw new Error(`Missing token CPI property '${name}' in ${this.ix.name}`);
  }

  private renderFieldName(baseType: InferredType | undefined, property: string): string {
    if (baseType?.kind === "value") {
      const type = baseType.type;
      if (typeof type !== "string" && type.kind === "struct_zc_ref") {
        const struct = this.program.structsZC.find((candidate) => candidate.name === type.name);
        if (struct?.fields.some((field) => field.name === property) === true) return toSnake(property);
      }
    }

    if (baseType?.kind === "account" && baseType.symbol.accountDef?.fields.some((field) => field.name === property) === true) return toSnake(property);
    return toSnake(property);
  }

  private renderBooleanLiteral(value: boolean, expectedType?: IrType): string {
    if (expectedType === "u8") return value ? "1" : "0";
    return value ? "true" : "false";
  }

  private renderNullLiteral(expectedType?: IrType): string {
    if (expectedType !== undefined && typeof expectedType === "object" && expectedType.kind === "option") return "None";
    return "Pubkey::default()";
  }

  private renderBinaryOperator(operator: string): string {
    switch (operator) {
      case "===": return "==";
      case "!==": return "!=";
      default: return operator;
    }
  }

  private commonNumericType(left: Node, right: Node, expectedType?: IrType): IrType | undefined {
    if (this.isNumericType(expectedType)) return expectedType;
    const leftType = this.numericTypeOf(this.inferExpressionType(left));
    const rightType = this.numericTypeOf(this.inferExpressionType(right));
    if (leftType === undefined) return rightType;
    if (rightType === undefined) return leftType;
    if (this.isSignedNumeric(leftType) !== this.isSignedNumeric(rightType)) return leftType;
    return this.numericRank(leftType) >= this.numericRank(rightType) ? leftType : rightType;
  }

  private wrapCastOperand(rendered: string): string {
    return rendered.includes(" as ") ? `(${rendered})` : rendered;
  }

  private coerceRendered(rendered: string, inferred: InferredType | undefined, expectedType?: IrType): string {
    const inferredType = this.numericTypeOf(inferred);
    if (!this.isNumericType(expectedType) || inferredType === undefined || inferredType === expectedType) return rendered;
    return `${rendered} as ${expectedType}`;
  }

  private numericTypeOf(inferred: InferredType | undefined): IrType | undefined {
    if (inferred?.kind !== "value") return undefined;
    return this.isNumericType(inferred.type) ? inferred.type : undefined;
  }

  private isNumericType(type: IrType | undefined): type is IrType {
    return typeof type === "string" && ["u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128"].includes(type);
  }

  private isSignedNumeric(type: IrType): boolean {
    return typeof type === "string" && type.startsWith("i");
  }

  private numericRank(type: IrType): number {
    if (typeof type !== "string") return 0;
    const width = Number(type.replace(/^[ui]/, ""));
    return Number.isFinite(width) ? width : 0;
  }

  private inferExpressionType(node: Node | undefined | null): InferredType | undefined {
    if (node === undefined || node === null) return undefined;
    if (isParenthesizedExpression(node)) return this.inferExpressionType(node.expression);
    if (isTSNonNullExpression(node)) return this.inferExpressionType(node.expression);
    if (isIdentifier(node)) {
      if (this.accountObjectAlias !== undefined && node.name === this.accountObjectAlias) return { kind: "accountObject" };
      if (this.argsObjectAlias !== undefined && node.name === this.argsObjectAlias) return { kind: "argsObject" };
      const symbol = this.symbols.get(node.name);
      if (symbol?.kind === "account" && symbol.account.constraint.kind === "remaining") return { kind: "remaining" };
      if (symbol?.kind === "account") return { kind: "account", symbol };
      if (symbol?.kind === "arg" || symbol?.kind === "local") return symbol.type !== undefined ? { kind: "value", type: symbol.type, zeroCopyBool: false } : undefined;
      return undefined;
    }
    if (isMemberExpression(node)) {
      if (node.computed) {
        const baseType = this.inferExpressionType(node.object);
        if (baseType?.kind === "remaining") return undefined;
        if (baseType?.kind === "value" && typeof baseType.type !== "string" && baseType.type.kind === "array") {
          return { kind: "value", type: baseType.type.inner, zeroCopyBool: false };
        }
        return undefined;
      }
      return this.inferPropertyType(this.inferExpressionType(node.object), memberPropertyName(node));
    }
    if (isBinaryExpression(node) || isLogicalExpression(node)) return this.inferNumericBinaryType(node);
    if (isConditionalExpression(node)) return this.inferExpressionType(node.consequent) ?? this.inferExpressionType(node.alternate);
    if (node.type === "Literal" && "bigint" in node) return { kind: "value", type: "u64", zeroCopyBool: false };
    if (isNumericLiteral(node)) return { kind: "value", type: "u64", zeroCopyBool: false };
    if (isStringLiteral(node)) return { kind: "value", type: "string", zeroCopyBool: false };
    if (isBooleanLiteral(node)) return { kind: "value", type: "bool", zeroCopyBool: false };
    if (isNullLiteral(node)) return { kind: "value", type: { kind: "option", inner: "pubkey" }, zeroCopyBool: false };
    if (isCallExpression(node)) {
      const callee = node.callee;
      if (isMemberExpression(callee) && isCpiSol(callee.object) && isIdentifier(callee.property) && callee.property.name === "timestamp") {
        return { kind: "value", type: "i64", zeroCopyBool: false };
      }
    }
    return undefined;
  }

  private inferPropertyType(baseType: InferredType | undefined, property: string): InferredType | undefined {
    if (baseType?.kind === "accountObject") {
      const accountName = property;
      const symbol = this.symbols.get(accountName);
      if (symbol?.kind === "account") return { kind: "account", symbol };
      return undefined;
    }
    if (baseType?.kind === "argsObject") {
      const arg = this.ix.args.find((candidate) => candidate.name === property);
      if (arg !== undefined) return { kind: "value", type: arg.type, zeroCopyBool: false };
      return undefined;
    }
    if (baseType?.kind === "remaining" && property === "length") return { kind: "value", type: "u64", zeroCopyBool: false };
    if (baseType?.kind === "account") {
      if (property === "key") return { kind: "value", type: "pubkey", zeroCopyBool: false };
      if (baseType.symbol.account.constraint.kind === "tokenAccount") return this.inferTokenAccountProperty(property);
      if (baseType.symbol.account.constraint.kind === "mint") return this.inferMintProperty(property);
      const field = baseType.symbol.accountDef?.fields.find((candidate) => candidate.name === property);
      if (field !== undefined) return { kind: "value", type: field.type, zeroCopyBool: baseType.symbol.accountDef?.zeroCopy === true && field.type === "bool" };
    }
    if (baseType?.kind === "value") {
      const type = baseType.type;
      if (typeof type !== "string" && type.kind === "struct_zc_ref") {
        const struct = this.program.structsZC.find((candidate) => candidate.name === type.name);
        const field = struct?.fields.find((candidate) => candidate.name === property);
        if (field !== undefined) return { kind: "value", type: field.type, zeroCopyBool: field.type === "bool" };
      }
    }
    return undefined;
  }

  private inferTokenAccountProperty(property: string): InferredType | undefined {
    if (property === "mint" || property === "owner") return { kind: "value", type: "pubkey", zeroCopyBool: false };
    if (property === "amount") return { kind: "value", type: "u64", zeroCopyBool: false };
    return undefined;
  }

  private inferMintProperty(property: string): InferredType | undefined {
    if (property === "key") return { kind: "value", type: "pubkey", zeroCopyBool: false };
    if (property === "decimals") return { kind: "value", type: "u8", zeroCopyBool: false };
    if (property === "supply") return { kind: "value", type: "u64", zeroCopyBool: false };
    if (property === "mintAuthority" || property === "freezeAuthority") return { kind: "value", type: "pubkey", zeroCopyBool: false };
    return undefined;
  }

  private inferNumericBinaryType(node: BinaryExpression | LogicalExpression): InferredType | undefined {
    const operator = node.operator;
    if (["===", "!==", "==", "!=", ">", ">=", "<", "<=", "&&", "||"].includes(operator)) return { kind: "value", type: "bool", zeroCopyBool: false };
    return this.inferExpressionType(node.left) ?? this.inferExpressionType(node.right);
  }

  private inferAssignmentTargetType(node: Node): InferredType | undefined {
    if (isIdentifier(node)) return this.inferExpressionType(node);
    if (isTSNonNullExpression(node)) return this.inferAssignmentTargetType(node.expression);
    if (isMemberExpression(node) && !node.computed) return this.inferPropertyType(this.inferExpressionType(node.object), memberPropertyName(node));
    if (isMemberExpression(node) && node.computed) return this.inferExpressionType(node);
    return undefined;
  }

  private shouldCoerceToPubkey(node: Node, other: Node): boolean {
    const ownType = this.inferExpressionType(node);
    const otherType = this.inferExpressionType(other);
    return ownType?.kind === "account" && otherType?.kind === "value" && otherType.type === "pubkey";
  }

  private isZeroCopyBoolField(baseType: InferredType | undefined, property: string): boolean {
    const inferred = this.inferPropertyType(baseType, property);
    return inferred?.kind === "value" && inferred.zeroCopyBool;
  }

  private renderAccountKey(symbol: SymbolInfo & { readonly kind: "account" }): string {
    if (symbol.accountDef?.zeroCopy === true) return `ctx.accounts.${symbol.rustName}.key()`;
    return `${symbol.rustName}.key()`;
  }

  private findEventFields(eventName: string): readonly IrAccountField[] {
    const event = this.program.events.find((candidate) => candidate.name === eventName);
    if (event !== undefined) return event.fields;
    const available = this.program.events.map((candidate) => candidate.name).join(", ") || "none";
    throw new Error(`Instruction '${this.ix.name}' emits unknown event '${eventName}'. Add it to program.events or use one of: ${available}.`);
  }

  private assertKnownError(errorName: string, node: Node): void {
    if (this.program.errors.some((error) => error.name === errorName)) return;
    const available = this.program.errors.map((error) => error.name).join(", ") || "none";
    throw new Error(`Instruction '${this.ix.name}' requires unknown error '${errorName}'. Add it to program.errors or use one of: ${available}. Offending code: ${nodeTextOf(this.source, node)}.`);
  }

  private assertEventPayload(eventName: string, payload: ObjectExpression, fields: readonly IrAccountField[]): void {
    const expected = new Set(fields.map((field) => field.name));
    const provided = new Set<string>();

    for (const property of payload.properties) {
      if (isSpreadElement(property)) this.unsupported("object spread", property, "Write every event payload field explicitly.");
      const name = isProperty(property) && property.shorthand
        ? memberPropertyName(property)
        : isProperty(property) && !property.shorthand && isIdentifier(property.key)
          ? property.key.name.replace(/^['"]|['"]$/g, "")
          : undefined;
      if (name === undefined) this.unsupported(`event payload property '${property.type}'`, property);
      provided.add(name);
      if (!expected.has(name)) {
        const available = [...expected].join(", ") || "none";
        throw new Error(`Instruction '${this.ix.name}' emits event '${eventName}' with unknown field '${name}'. Use one of: ${available}.`);
      }
    }

    for (const field of fields) {
      if (!provided.has(field.name)) {
        throw new Error(`Instruction '${this.ix.name}' emits event '${eventName}' without required field '${field.name}'.`);
      }
    }
  }

  private resolveAccountDef(account: IrInstructionAccount): IrAccount | undefined {
    const constraint = account.constraint;
    const accountName = constraint.kind === "init" || constraint.kind === "mut" || constraint.kind === "close" || constraint.kind === "bare"
      ? constraint.accountName
      : account.name;
    const normalized = accountName.toLowerCase();
    return this.program.accounts.find((candidate) => candidate.name.toLowerCase() === normalized || toPascal(candidate.name).toLowerCase() === normalized);
  }

  private isMutableAccount(account: IrInstructionAccount): boolean {
    const constraint = account.constraint;
    return constraint.kind === "mut" || constraint.kind === "init" || constraint.kind === "initIfNeeded" || constraint.kind === "close" || constraint.kind === "realloc" ||
      (constraint.kind === "tokenAccount" && constraint.mutable) ||
      (constraint.kind === "mint" && constraint.mutable);
  }

  private isPropertyName(_node: Node): boolean {
    return false;
  }

  private assertKnownProperty(baseType: InferredType | undefined, property: string, node: Node): void {
    if (baseType?.kind === "accountObject" || baseType?.kind === "argsObject") return;
    if (baseType?.kind !== "account") return;
    const constraint = baseType.symbol.account.constraint.kind;
    if (constraint === "tokenAccount" || constraint === "mint" || constraint === "clock") return;
    const accountDef = baseType.symbol.accountDef;
    if (accountDef === undefined) return;
    if (accountDef.fields.some((field) => field.name === property)) return;
    this.unsupported(`unknown field '${property}' on account '${accountDef.name}'`, node, `Use one of: ${accountDef.fields.map((field) => field.name).join(", ")}.`);
  }

  private unsupported(feature: string, node: Node | undefined, guidance?: string): never {
    const snippet = node !== undefined ? nodeTextOf(this.source, node).replace(/\s+/g, " ").slice(0, 160) : feature;
    const suffix = guidance === undefined ? "" : ` ${guidance}`;
    throw new Error(`Instruction '${this.ix.name}' uses unsupported TypeScript: ${feature}. Offending code: ${snippet}.${suffix}`);
  }

  private getForLoopVariable(initializer: Node): string | undefined {
    if (isVariableDeclaration(initializer)) {
      for (const decl of initializer.declarations) {
        if (isIdentifier(decl.id)) return decl.id.name;
      }
    }
    if (isAssignmentExpression(initializer) && isIdentifier(initializer.left)) return initializer.left.name;
    return undefined;
  }

  private getForLoopStart(initializer: Node): string | undefined {
    if (isVariableDeclaration(initializer)) {
      for (const decl of initializer.declarations) {
        if (decl.init !== undefined && decl.init !== null) return this.renderExpression(decl.init, "value");
      }
      return "0";
    }
    if (isAssignmentExpression(initializer)) return this.renderExpression(initializer.right, "value");
    return undefined;
  }

  private getForLoopEnd(condition: Node): string | undefined {
    if (!isBinaryExpression(condition) && !isLogicalExpression(condition)) return undefined;
    return this.renderExpression(condition.right, "value");
  }
}

function memberPropertyName(node: Node): string {
  if (isMemberExpression(node) && isIdentifier(node.property)) return node.property.name;
  if (isIdentifier(node)) return node.name;
  if (isProperty(node) && isIdentifier(node.key)) return node.key.name;
  return "";
}

function childrenOf(node: Node): readonly Node[] {
  const result: Node[] = [];
  const record = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range" || key === "parent") continue;
    const value = record[key];
    if (isNodeLike(value)) {
      result.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNodeLike(item)) result.push(item);
      }
    }
  }
  return result;
}

function isNodeLike(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value && "start" in value && "end" in value;
}

type ResolvedAliases = {
  readonly accountObjectAlias: string | undefined;
  readonly argsObjectAlias: string | undefined;
  readonly contextObjectAlias: string | undefined;
};

function resolveRunParamAliases(ix: IrInstruction, params: readonly Node[]): ResolvedAliases {
  if (params.length === 0) return { accountObjectAlias: undefined, argsObjectAlias: undefined, contextObjectAlias: undefined };

  const accountNames = new Set(ix.accounts.map((a) => a.name));
  const argNames = new Set(ix.args.map((a) => a.name));

  let hasAccountDestructuring = false;
  let hasArgsDestructuring = false;

  for (const param of params) {
    if (param.type !== "ObjectPattern") continue;
    const keys = param.properties
      .filter((p): p is Extract<typeof p, { readonly type: "Property" }> => p.type === "Property" && isIdentifier(p.value))
      .map((p) => (p.value as { readonly name: string }).name);
    if (keys.length === 0) continue;
    if (keys.every((k) => accountNames.has(k))) hasAccountDestructuring = true;
    if (keys.every((k) => argNames.has(k))) hasArgsDestructuring = true;
  }

  const identifiers = params
    .filter((p): p is Extract<typeof p, { readonly type: "Identifier" }> => p.type === "Identifier")
    .map((p) => p.name);

  let accountObjectAlias: string | undefined;
  let argsObjectAlias: string | undefined;
  let contextObjectAlias: string | undefined;

  for (const name of identifiers) {
    const isContextLike = name === "ctx" || name === "context" || name === "_";
    const isArgsLike = name === "args" || name === "arguments";
    const isAccountsLike = name === "accounts" || name === "accs";

    if (isContextLike) {
      contextObjectAlias = name;
      continue;
    }

    if (isArgsLike && !hasArgsDestructuring) {
      argsObjectAlias = name;
      continue;
    }

    if (isAccountsLike && !hasAccountDestructuring) {
      accountObjectAlias = name;
      continue;
    }

    if (!hasArgsDestructuring && argsObjectAlias === undefined && !isAccountsLike) {
      argsObjectAlias = name;
      continue;
    }

    if (!hasAccountDestructuring && accountObjectAlias === undefined && !isArgsLike) {
      accountObjectAlias = name;
      continue;
    }

    if (contextObjectAlias === undefined) {
      contextObjectAlias = name;
    }
  }

  return { accountObjectAlias, argsObjectAlias, contextObjectAlias };
}
