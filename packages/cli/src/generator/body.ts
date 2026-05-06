import {
  Node,
  SyntaxKind,
  type Expression,
  type ObjectLiteralExpression,
  type Statement,
} from "ts-morph";
import type {
  IrAccount,
  IrAccountField,
  IrInstruction,
  IrInstructionAccount,
  IrProgram,
  IrSeed,
  IrType,
} from "../ir/types";
import { toPascal, toSnake } from "../naming";
import { CodeWriter } from "./code-writer";
import {
  isCpiSol,
  isIntegerSeedType,
  formatSeedType,
  parseBodyStatements,
} from "./body/utils";

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
};

type ExpressionMode = "value" | "condition" | "pubkey";

type AssignmentOperator = "=" | "+=" | "-=" | "*=" | "/=";

type CpiCall = {
  readonly moduleName: "token" | "token_interface";
  readonly functionName: "transfer" | "transfer_checked" | "mint_to" | "burn";
  readonly accountsType: "Transfer" | "TransferChecked" | "MintTo" | "Burn";
  readonly accounts: readonly CpiAccountField[];
  readonly amount: Expression;
  readonly decimals: Expression | undefined;
  readonly authority: string;
};

type CpiAccountField = {
  readonly name: string;
  readonly expression: Expression;
};

export function transpileBody(ix: IrInstruction, program: IrProgram): string {
  const statements = parseBodyStatements(ix.body);
  const context = new BodyContext(ix, program, statements);
  return context.transpile();
}

class BodyContext {
  private readonly symbols = new Map<string, SymbolInfo>();
  private readonly locals = new Map<string, SymbolInfo & { readonly kind: "local" }>();
  private readonly mutatedLocals = new Set<string>();
  private readonly mutatedAccounts = new Set<string>();
  private readonly deferredInitializers = new Set<string>();
  private readonly elementAliases = new Map<string, import("ts-morph").ElementAccessExpression>();
  private readonly referencedAccounts = new Set<string>();
  private cpiIndex = 0;
  private remainingWriteIndex = 0;

  public constructor(
    private readonly ix: IrInstruction,
    private readonly program: IrProgram,
    private readonly statements: readonly Statement[],
  ) {
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

  public transpile(): string {
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
      if (Node.isVariableStatement(node)) {
        for (const declaration of node.getDeclarations()) {
          const name = declaration.getName();
          const initializer = declaration.getInitializer();
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

      if (Node.isIdentifier(node)) {
        const symbol = this.symbols.get(node.getText());
        if (symbol?.kind === "account" && !this.isPropertyName(node)) {
          this.referencedAccounts.add(symbol.sourceName);
        }
      }

      if (Node.isBinaryExpression(node) && this.isAssignmentOperator(node.getOperatorToken().getText())) {
        const left = node.getLeft();
        this.collectMutatedAccounts(left);
        if (Node.isIdentifier(left)) this.mutatedLocals.add(left.getText());
        if (Node.isPropertyAccessExpression(left) && Node.isIdentifier(left.getExpression())) this.mutatedLocals.add(left.getExpression().getText());
        if (Node.isElementAccessExpression(left) && Node.isIdentifier(left.getExpression())) this.mutatedLocals.add(left.getExpression().getText());
      }

      if (Node.isPostfixUnaryExpression(node) || Node.isPrefixUnaryExpression(node)) {
        const operand = node.getOperand();
        if (Node.isIdentifier(operand)) this.mutatedLocals.add(operand.getText());
      }

      for (const child of node.getChildren()) visit(child);
    };

    for (const statement of this.statements) visit(statement);
    this.collectDeferredInitializers(this.statements);
  }

  private collectMutatedAccounts(node: Node): void {
    if (Node.isIdentifier(node) && !this.isPropertyName(node)) {
      const symbol = this.symbols.get(node.getText());
      if (symbol?.kind === "account") this.mutatedAccounts.add(symbol.sourceName);
    }
    for (const child of node.getChildren()) this.collectMutatedAccounts(child);
  }

  private collectDeferredInitializers(statements: readonly Statement[]): void {
    for (let i = 0; i < statements.length - 1; i++) {
      const statement = statements[i];
      const next = statements[i + 1];
      if (!Node.isVariableStatement(statement) || !Node.isIfStatement(next)) continue;
      const declaration = statement.getDeclarations()[0];
      if (declaration === undefined) continue;
      const initializer = declaration.getInitializer();
      if (initializer === undefined || !this.isZeroLiteral(initializer)) continue;
      const name = declaration.getName();
      const elseStatement = next.getElseStatement();
      if (elseStatement === undefined) continue;
      if (this.statementAssignsTo(next.getThenStatement(), name) && this.statementAssignsTo(elseStatement, name)) {
        this.deferredInitializers.add(name);
      }
    }
  }

  private statementAssignsTo(statement: Statement, name: string): boolean {
    const statements = Node.isBlock(statement) ? statement.getStatements() : [statement];
    return statements.some((candidate) => {
      if (!Node.isExpressionStatement(candidate)) return false;
      const expression = candidate.getExpression();
      if (!Node.isBinaryExpression(expression) || !this.isAssignmentOperator(expression.getOperatorToken().getText())) return false;
      const left = expression.getLeft();
      return Node.isIdentifier(left) && left.getText() === name;
    });
  }

  private isZeroLiteral(node: Node): boolean {
    return (Node.isNumericLiteral(node) || Node.isBigIntLiteral(node)) && node.getText().replace(/n$/, "") === "0";
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

  private writeStatement(cw: CodeWriter, statement: Statement): void {
    if (Node.isVariableStatement(statement)) {
      for (const line of this.renderVariableStatement(statement)) cw.line(line);
      return;
    }

    if (Node.isExpressionStatement(statement)) {
      for (const line of this.renderExpressionStatement(statement.getExpression())) cw.line(line);
      return;
    }

    if (Node.isIfStatement(statement)) {
      this.writeIfStatement(cw, statement);
      return;
    }

    if (Node.isForStatement(statement)) {
      this.writeForStatement(cw, statement);
      return;
    }

    if (Node.isContinueStatement(statement)) {
      cw.line("continue;");
      return;
    }

    if (Node.isBreakStatement(statement)) {
      cw.line("break;");
      return;
    }

    if (Node.isReturnStatement(statement)) {
      const returnExpr = statement.getExpression();
      if (returnExpr !== undefined) {
        cw.line(`return Ok(${this.renderExpression(returnExpr, "value")});`);
      } else {
        cw.line("return Ok(());");
      }
      return;
    }
    if (Node.isForOfStatement(statement) || Node.isForInStatement(statement)) this.unsupported("for...of/for...in loops", statement, "Use a bounded index loop: for (let i = 0; i < limit; i++). On-chain programs need explicit bounds.");
    if (Node.isWhileStatement(statement) || Node.isDoStatement(statement)) this.unsupported("while/do loops", statement, "Use a bounded for loop: for (let i = 0; i < limit; i++). On-chain programs need explicit bounds.");
    if (Node.isSwitchStatement(statement)) this.unsupported("switch statements", statement, "Use explicit if/else branches.");
    if (Node.isTryStatement(statement)) this.unsupported("try/catch/finally", statement, "Use ctx.require(...) and Result-returning supported operations instead.");
    if (Node.isThrowStatement(statement)) this.unsupported("throw statements", statement, "Use ctx.require(condition, 'ErrorName') with inline program errors.");

    if (Node.isBlock(statement)) {
      for (const nested of statement.getStatements()) this.writeStatement(cw, nested);
      return;
    }

    this.unsupported(`statement syntax '${statement.getKindName()}'`, statement);
  }

  private renderVariableStatement(statement: import("ts-morph").VariableStatement): readonly string[] {
    const lines: string[] = [];
    for (const declaration of statement.getDeclarations()) {
      const name = declaration.getName();
      if (name.startsWith("{") || name.startsWith("[")) {
        this.unsupported("destructuring variable declarations", declaration, "Declare each local explicitly instead of using object/array destructuring.");
      }
      const rustName = toSnake(name);
      const init = declaration.getInitializer();
      const mutable = this.mutatedLocals.has(name) && !this.deferredInitializers.has(name);
      const keyword = mutable ? "let mut" : "let";
      if (init === undefined || this.deferredInitializers.has(name)) {
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
      if (Node.isConditionalExpression(init) && this.mutatedLocals.has(name)) {
        throw new Error(`Instruction '${this.ix.name}' creates a mutable conditional alias '${name}'. Rewrite it as explicit branches so generated Rust preserves account mutations.`);
      }
      if (Node.isElementAccessExpression(init) && this.mutatedLocals.has(name)) {
        this.elementAliases.set(name, init);
        continue;
      }
      lines.push(`${keyword} ${rustName} = ${this.renderExpression(init, "value", inferred?.kind === "value" ? inferred.type : undefined)};`);
    }
    return lines;
  }

  private renderExpressionStatement(expression: Expression): readonly string[] {
    const cpi = this.tryParseCpiCall(expression);
    if (cpi !== undefined) return this.renderCpiCall(cpi);

    if (Node.isCallExpression(expression)) {
      const requireLine = this.tryRenderRequire(expression);
      if (requireLine !== undefined) return [requireLine];
      const emitLine = this.tryRenderEmit(expression);
      if (emitLine !== undefined) return [emitLine];
      const logLine = this.tryRenderLog(expression);
      if (logLine !== undefined) return [logLine];
    }

    if (Node.isBinaryExpression(expression) && this.isAssignmentOperator(expression.getOperatorToken().getText())) {
      const remainingAssignment = this.tryRenderRemainingAssignment(expression);
      if (remainingAssignment !== undefined) return remainingAssignment;
      const indexedAssignment = this.tryRenderIndexedAssignment(expression);
      if (indexedAssignment !== undefined) return indexedAssignment;
      return [this.renderAssignment(expression)];
    }

    return [`${this.renderExpression(expression, "value")};`];
  }

  private writeIfStatement(cw: CodeWriter, statement: import("ts-morph").IfStatement): void {
    const condition = this.renderExpression(statement.getExpression(), "condition");
    cw.block(`if ${condition}`, () => {
      this.writeNestedStatement(cw, statement.getThenStatement());
    });
    const elseStatement = statement.getElseStatement();
    if (elseStatement === undefined) return;
    cw.block("else", () => {
      this.writeNestedStatement(cw, elseStatement);
    });
  }

  private writeForStatement(cw: CodeWriter, statement: import("ts-morph").ForStatement): void {
    const initializer = statement.getInitializer();
    const condition = statement.getCondition();
    if (initializer === undefined || condition === undefined) {
      this.unsupported("for loops without initializer or condition", statement, "Use: for (let i = 0; i < limit; i++). ");
    }

    const loopVariable = this.getForLoopVariable(initializer);
    const start = this.getForLoopStart(initializer);
    const end = this.getForLoopEnd(condition);
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
      this.writeNestedStatement(cw, statement.getStatement());
    });
  }

  private writeNestedStatement(cw: CodeWriter, statement: Statement): void {
    if (Node.isBlock(statement)) {
      for (const nested of statement.getStatements()) this.writeStatement(cw, nested);
      return;
    }
    this.writeStatement(cw, statement);
  }

  private tryRenderIndexedAssignment(expression: import("ts-morph").BinaryExpression): readonly string[] | undefined {
    const left = expression.getLeft();
    if (!Node.isElementAccessExpression(left)) return undefined;
    const base = left.getExpression();
    const index = left.getArgumentExpression();
    if (!Node.isPropertyAccessExpression(base) || index === undefined) return undefined;
    const owner = base.getExpression();
    if (!Node.isIdentifier(owner) || !this.expressionReferencesIdentifier(index, owner.getText())) return undefined;
    const variable = `${toSnake(owner.getText())}_${toSnake(base.getName())}_index_${this.remainingWriteIndex++}`;
    const targetType = this.inferAssignmentTargetType(left);
    const expected = targetType?.kind === "value" ? targetType.type : undefined;
    return [
      `let ${variable} = ${this.renderExpression(index, "value")} as usize;`,
      `${this.renderExpression(base, "value")}[${variable}] ${expression.getOperatorToken().getText()} ${this.renderExpression(expression.getRight(), "value", expected)};`,
    ];
  }

  private expressionReferencesIdentifier(node: Node, name: string): boolean {
    if (Node.isIdentifier(node) && node.getText() === name) return true;
    return node.getChildren().some((child) => this.expressionReferencesIdentifier(child, name));
  }

  private tryRenderRemainingAssignment(expression: import("ts-morph").BinaryExpression): readonly string[] | undefined {
    const operator = expression.getOperatorToken().getText();
    if (operator !== "=") return undefined;
    const left = expression.getLeft();
    if (!Node.isPropertyAccessExpression(left)) return undefined;
    const rawBase = left.getExpression();
    const base = Node.isNonNullExpression(rawBase) ? rawBase.getExpression() : rawBase;
    if (!Node.isElementAccessExpression(base)) return undefined;
    const remainingBase = base.getExpression();
    if (!Node.isIdentifier(remainingBase)) return undefined;
    const symbol = this.symbols.get(remainingBase.getText());
    if (symbol?.kind !== "account" || symbol.account.constraint.kind !== "remaining") return undefined;
    const accountName = symbol.account.constraint.accountName;
    if (accountName === undefined) return undefined;
    const index = base.getArgumentExpression();
    const renderedIndex = index === undefined ? "0" : this.renderExpression(index, "value");
    const variable = `${symbol.rustName}_item_${this.remainingWriteIndex++}`;
    const fieldName = left.getName();
    const accountDef = this.program.accounts.find((account) => account.name === accountName);
    const field = accountDef?.fields.find((candidate) => candidate.name === fieldName);
    const expected = field?.type;
    return [
      `let mut ${variable} = Account::<${toPascal(accountName)}>::try_from(&ctx.remaining_accounts[(${renderedIndex}) as usize])?;`,
      `${variable}.${toSnake(fieldName)} = ${this.renderExpression(expression.getRight(), "value", expected)};`,
      `${variable}.exit(ctx.program_id)?;`,
    ];
  }

  private renderAssignment(expression: import("ts-morph").BinaryExpression): string {
    const operator = expression.getOperatorToken().getText() as AssignmentOperator;
    const left = expression.getLeft();
    const targetType = this.inferAssignmentTargetType(left);
    const right = expression.getRight();
    const fieldType = targetType?.kind === "value" ? targetType.zeroCopyBool ? "u8" : targetType.type : undefined;
    const renderedRight = this.renderExpression(right, "value", fieldType);
    const isOption = fieldType !== undefined && typeof fieldType === "object" && fieldType.kind === "option";
    const isNull = right.getKind() === SyntaxKind.NullKeyword;
    const wrappedRight = isOption && !isNull ? `Some(${renderedRight})` : renderedRight;
    return `${this.renderAssignmentTarget(left)} ${operator} ${wrappedRight};`;
  }

  private tryRenderRequire(expression: import("ts-morph").CallExpression): string | undefined {
    const callee = expression.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    if (callee.getExpression().getText() !== "ctx" || callee.getName() !== "require") return undefined;
    const args = expression.getArguments();
    const condition = args[0];
    const error = args[1];
    if (condition === undefined || error === undefined || !Node.isStringLiteral(error)) return undefined;
    const errorName = error.getLiteralValue();
    this.assertKnownError(errorName, error);
    return `require!(${this.renderExpression(condition, "condition")}, ProgramError::${toPascal(errorName)});`;
  }

  private tryRenderEmit(expression: import("ts-morph").CallExpression): string | undefined {
    const callee = expression.getExpression();
    const args = expression.getArguments();

    if (Node.isPropertyAccessExpression(callee) && callee.getExpression().getText() === "ctx" && callee.getName() === "emit") {
      const eventName = args[0];
      const payload = args[1];
      if (eventName === undefined || payload === undefined || !Node.isStringLiteral(eventName) || !Node.isObjectLiteralExpression(payload)) return undefined;
      const eventNameValue = eventName.getLiteralValue();
      const fields = this.findEventFields(eventNameValue);
      this.assertEventPayload(eventNameValue, payload, fields);
      return `emit!(${toPascal(eventNameValue)} { ${this.renderObjectFields(payload, fields)} });`;
    }

    return undefined;
  }

  private tryRenderLog(expression: import("ts-morph").CallExpression): string | undefined {
    const callee = expression.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    if (callee.getExpression().getText() !== "ctx" || callee.getName() !== "log") return undefined;
    const args = expression.getArguments();
    const message = args[0];
    if (message === undefined || !Node.isStringLiteral(message)) return undefined;
    const renderedArgs = args.slice(1).map((arg) => this.renderExpression(arg, "value"));
    const messageText = message.getLiteralValue();
    const hasPlaceholders = messageText.includes("{}");
    return renderedArgs.length === 0
      ? `msg!(${JSON.stringify(messageText)});`
      : hasPlaceholders
        ? `msg!(${JSON.stringify(messageText)}, ${renderedArgs.join(", ")});`
        : `msg!("${messageText} ${renderedArgs.map(() => "{}").join(" ")}", ${renderedArgs.join(", ")});`;
  }

  private renderExpression(node: Node, mode: ExpressionMode, expectedType?: IrType): string {
    if (Node.isParenthesizedExpression(node)) return `(${this.renderExpression(node.getExpression(), mode, expectedType)})`;
    if (Node.isNonNullExpression(node)) return this.renderExpression(node.getExpression(), mode, expectedType);
    if (Node.isIdentifier(node)) return this.renderIdentifier(node.getText(), mode, expectedType);
    if (Node.isNumericLiteral(node)) return node.getText();
    if (Node.isBigIntLiteral(node)) return node.getText().replace(/n$/, "");
    if (Node.isStringLiteral(node)) {
      if (expectedType === "pubkey" && node.getLiteralValue() === "") return "Pubkey::default()";
      return expectedType === "string" ? `${JSON.stringify(node.getLiteralValue())}.to_string()` : JSON.stringify(node.getLiteralValue());
    }
    if (Node.isTrueLiteral(node)) return this.renderBooleanLiteral(true, expectedType);
    if (Node.isFalseLiteral(node)) return this.renderBooleanLiteral(false, expectedType);
    if (node.getKind() === SyntaxKind.NullKeyword) return this.renderNullLiteral(expectedType);
    if (Node.isPropertyAccessExpression(node)) return this.renderPropertyAccess(node, mode, expectedType);
    if (Node.isElementAccessExpression(node)) return this.renderElementAccess(node, mode, expectedType);
    if (Node.isBinaryExpression(node)) return this.renderBinaryExpression(node, mode, expectedType);
    if (Node.isConditionalExpression(node)) return this.renderConditionalExpression(node, expectedType);
    if (Node.isPrefixUnaryExpression(node)) return this.renderPrefixUnaryExpression(node, mode, expectedType);
    if (Node.isPostfixUnaryExpression(node)) return this.renderPostfixUnaryExpression(node);
    if (Node.isCallExpression(node)) return this.renderCallExpression(node, expectedType);
    if (Node.isAsExpression(node)) return this.renderExpression(node.getExpression(), mode, expectedType);
    if (Node.isAwaitExpression(node)) this.unsupported("await expressions", node, "On-chain instruction logic cannot await. Move async work to the client/off-chain code.");
    if (Node.isTemplateExpression(node) || Node.isNoSubstitutionTemplateLiteral(node)) this.unsupported("template string expressions", node, "Use string literals only in supported log/message contexts.");
    if (Node.isSpreadElement(node)) this.unsupported("spread expressions", node, "Write fields or array elements explicitly.");
    if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) this.unsupported("nested functions", node, "Inline the logic or move it into a supported DSL primitive.");
    if (Node.isNewExpression(node)) return this.renderNewExpression(node, expectedType);
    if (Node.isObjectLiteralExpression(node)) return this.renderObjectLiteral(node, expectedType);
    if (Node.isArrayLiteralExpression(node)) return this.renderArrayLiteral(node, expectedType);
    this.unsupported(`expression syntax '${node.getKindName()}'`, node);
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

  private renderPropertyAccess(node: import("ts-morph").PropertyAccessExpression, mode: ExpressionMode, expectedType?: IrType): string {
    const rawBase = node.getExpression();
    const base = Node.isIdentifier(rawBase) ? this.elementAliases.get(rawBase.getText()) ?? rawBase : rawBase;
    const property = node.getName();
    const baseType = this.inferExpressionType(base);

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

  private renderElementAccess(node: import("ts-morph").ElementAccessExpression, mode: ExpressionMode, expectedType?: IrType): string {
    const base = node.getExpression();
    const arg = node.getArgumentExpression();
    const renderedArg = arg === undefined ? "0" : this.renderExpression(arg, "value");
    const baseType = this.inferExpressionType(base);
    const renderedBase = baseType?.kind === "remaining" ? "ctx.remaining_accounts" : this.renderExpression(base, "value");
    const value = `${renderedBase}[(${renderedArg}) as usize]`;
    const inferred = this.inferExpressionType(node);
    if (mode === "condition" && inferred?.kind === "value" && inferred.type === "bool") return `${value} != 0`;
    return this.coerceRendered(value, inferred, expectedType);
  }

  private renderBinaryExpression(node: import("ts-morph").BinaryExpression, mode: ExpressionMode, expectedType?: IrType): string {
    const operator = this.renderBinaryOperator(node.getOperatorToken().getText());
    const left = node.getLeft();
    const right = node.getRight();
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

  private renderConditionalExpression(node: import("ts-morph").ConditionalExpression, expectedType?: IrType): string {
    return `if ${this.renderExpression(node.getCondition(), "condition")} { ${this.renderExpression(node.getWhenTrue(), "value", expectedType)} } else { ${this.renderExpression(node.getWhenFalse(), "value", expectedType)} }`;
  }

  private renderPrefixUnaryExpression(node: import("ts-morph").PrefixUnaryExpression, mode: ExpressionMode, expectedType?: IrType): string {
    const operator = node.getOperatorToken();
    const operand = this.renderExpression(node.getOperand(), mode, expectedType);
    if (operator === SyntaxKind.ExclamationToken) return `!${operand}`;
    if (operator === SyntaxKind.MinusToken) return `-${operand}`;
    if (operator === SyntaxKind.PlusToken) return operand;
    return `${node.getOperatorToken()}${operand}`;
  }

  private renderPostfixUnaryExpression(node: import("ts-morph").PostfixUnaryExpression): string {
    const operand = this.renderAssignmentTarget(node.getOperand());
    const operator = node.getOperatorToken();
    if (operator === SyntaxKind.PlusPlusToken) return `${operand} += 1`;
    if (operator === SyntaxKind.MinusMinusToken) return `${operand} -= 1`;
    return `${operand}`;
  }

  private renderCallExpression(node: import("ts-morph").CallExpression, expectedType?: IrType): string {
    const expression = node.getExpression();
    if (Node.isPropertyAccessExpression(expression)) {
      const base = expression.getExpression();
      const method = expression.getName();
      if (isCpiSol(base) && method === "timestamp") {
        return expectedType === "u64" ? "Clock::get()?.unix_timestamp as u64" : "Clock::get()?.unix_timestamp";
      }
      if (method === "abs") return this.coerceRendered(`${this.renderExpression(base, "value")}.abs()`, this.inferExpressionType(base), expectedType);
    }
    this.unsupported(`function call '${node.getExpression().getText()}'`, node, "Supported calls are ctx.require, ctx.emit, ctx.log, sol.timestamp(), .abs(), and token CPI helpers.");
  }

  private renderNewExpression(node: import("ts-morph").NewExpression, expectedType?: IrType): string {
    const expression = node.getExpression().getText();
    if (expression === "Uint8Array") {
      const arg = node.getArguments()[0];
      if (arg !== undefined && Node.isArrayLiteralExpression(arg)) {
        return `vec![${arg.getElements().map((el) => `${this.renderExpression(el, "value")}u8`).join(", ")}]`;
      }
      return "Vec::new()";
    }
    void expectedType;
    this.unsupported(`constructor '${expression}'`, node, "Only new Uint8Array([...]) is supported in instruction bodies.");
  }

  private renderObjectLiteral(node: ObjectLiteralExpression, expectedType?: IrType): string {
    if (expectedType !== undefined && typeof expectedType !== "string" && expectedType.kind === "struct_zc_ref") {
      const struct = this.program.structsZC.find((candidate) => candidate.name === expectedType.name);
      const fields = this.renderObjectFields(node, struct?.fields ?? []);
      return `${toPascal(expectedType.name)} { ${fields}, ..Default::default() }`;
    }
    return `{ ${this.renderObjectFields(node, [])} }`;
  }

  private renderArrayLiteral(node: import("ts-morph").ArrayLiteralExpression, expectedType?: IrType): string {
    const values = node.getElements().map((element) => this.renderExpression(element, "value")).join(", ");
    if (expectedType === "bytes") return `vec![${values}]`;
    return `[${values}]`;
  }

  private renderObjectFields(node: ObjectLiteralExpression, fields: readonly IrAccountField[]): string {
    return node.getProperties().map((property) => {
      if (Node.isShorthandPropertyAssignment(property)) {
        const name = property.getName();
        const fieldType = fields.find((field) => field.name === name)?.type;
        return `${toSnake(name)}: ${this.renderIdentifier(name, "value", fieldType)}`;
      }
      if (Node.isPropertyAssignment(property)) {
        const name = property.getName().replace(/^['"]|['"]$/g, "");
        const initializer = property.getInitializer();
        const fieldType = fields.find((field) => field.name === name)?.type;
        return `${toSnake(name)}: ${initializer === undefined ? toSnake(name) : this.renderExpression(initializer, "value", fieldType)}`;
      }
      if (Node.isSpreadAssignment(property)) this.unsupported("object spread", property, "Write every object field explicitly.");
      this.unsupported(`object literal property '${property.getKindName()}'`, property);
    }).join(", ");
  }

  private renderAssignmentTarget(node: Node): string {
    if (Node.isIdentifier(node)) return this.renderIdentifier(node.getText(), "value");
    if (Node.isNonNullExpression(node)) return this.renderAssignmentTarget(node.getExpression());
    if (Node.isPropertyAccessExpression(node)) {
      const rawBase = node.getExpression();
      const aliasedBase = Node.isIdentifier(rawBase) ? this.elementAliases.get(rawBase.getText()) ?? rawBase : rawBase;
      const base = this.renderExpression(aliasedBase, "value");
      const baseType = this.inferExpressionType(aliasedBase);
      this.assertKnownProperty(baseType, node.getName(), node);
      return `${base}.${this.renderFieldName(baseType, node.getName())}`;
    }
    if (Node.isElementAccessExpression(node)) {
      const base = this.renderExpression(node.getExpression(), "value");
      const arg = node.getArgumentExpression();
      const renderedArg = arg === undefined ? "0" : this.renderExpression(arg, "value");
      return `${base}[(${renderedArg}) as usize]`;
    }
    this.unsupported(`assignment target '${node.getKindName()}'`, node);
  }

  private tryParseCpiCall(expression: Expression): CpiCall | undefined {
    if (!Node.isCallExpression(expression)) return undefined;
    const callee = expression.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    const calleeBase = callee.getExpression();
    const isTokenCall = Node.isPropertyAccessExpression(calleeBase) && calleeBase.getExpression().getText() === "cpi" && calleeBase.getName() === "token";
    if (!isTokenCall) return undefined;
    const arg = expression.getArguments()[0];
    if (arg === undefined || !Node.isObjectLiteralExpression(arg)) return undefined;

    const usesToken2022 = this.ix.accounts.some((account) => account.constraint.kind === "token2022Program");
    const method = callee.getName();
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
        authority: authority.getText(),
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
        authority: authority.getText(),
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
        authority: authority.getText(),
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
        authority: authority.getText(),
      };
    }

    return undefined;
  }

  private renderCpiCall(cpi: CpiCall): readonly string[] {
    const authority = this.symbols.get(cpi.authority);
    const signerSeedAccount = authority?.kind === "account" && authority.account.constraint.kind !== "signer"
      ? authority
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
      `${callIndent}        ctx.accounts.${programRustName}.key(),`,
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

  private renderAccountInfoExpression(expression: Expression): string {
    if (Node.isIdentifier(expression)) {
      const symbol = this.symbols.get(expression.getText());
      if (symbol?.kind === "account" && symbol.accountDef?.zeroCopy === true) return `ctx.accounts.${symbol.rustName}.to_account_info()`;
      if (symbol !== undefined) return `${symbol.rustName}.to_account_info()`;
    }
    return `${this.renderExpression(expression, "value")}.to_account_info()`;
  }

  private requireObjectExpression(obj: ObjectLiteralExpression, name: string): Expression {
    const property = obj.getProperty(name);
    if (property !== undefined && Node.isPropertyAssignment(property)) {
      const initializer = property.getInitializer();
      if (initializer !== undefined) return initializer;
    }
    if (property !== undefined && Node.isShorthandPropertyAssignment(property)) return property.getNameNode();
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

  private inferExpressionType(node: Node | undefined): InferredType | undefined {
    if (node === undefined) return undefined;
    if (Node.isParenthesizedExpression(node)) return this.inferExpressionType(node.getExpression());
    if (Node.isNonNullExpression(node)) return this.inferExpressionType(node.getExpression());
    if (Node.isIdentifier(node)) {
      const symbol = this.symbols.get(node.getText());
      if (symbol?.kind === "account" && symbol.account.constraint.kind === "remaining") return { kind: "remaining" };
      if (symbol?.kind === "account") return { kind: "account", symbol };
      if (symbol?.kind === "arg" || symbol?.kind === "local") return symbol.type !== undefined ? { kind: "value", type: symbol.type, zeroCopyBool: false } : undefined;
      return undefined;
    }
    if (Node.isPropertyAccessExpression(node)) return this.inferPropertyType(this.inferExpressionType(node.getExpression()), node.getName());
    if (Node.isElementAccessExpression(node)) {
      const baseType = this.inferExpressionType(node.getExpression());
      if (baseType?.kind === "remaining") return undefined;
      if (baseType?.kind === "value" && typeof baseType.type !== "string" && baseType.type.kind === "array") {
        return { kind: "value", type: baseType.type.inner, zeroCopyBool: false };
      }
      return undefined;
    }
    if (Node.isBinaryExpression(node)) return this.inferNumericBinaryType(node);
    if (Node.isConditionalExpression(node)) return this.inferExpressionType(node.getWhenTrue()) ?? this.inferExpressionType(node.getWhenFalse());
    if (Node.isBigIntLiteral(node)) return { kind: "value", type: "u64", zeroCopyBool: false };
    if (Node.isNumericLiteral(node)) return { kind: "value", type: "u64", zeroCopyBool: false };
    if (Node.isStringLiteral(node)) return { kind: "value", type: "string", zeroCopyBool: false };
    if (Node.isTrueLiteral(node) || Node.isFalseLiteral(node)) return { kind: "value", type: "bool", zeroCopyBool: false };
    if (node.getKind() === SyntaxKind.NullKeyword) return { kind: "value", type: { kind: "option", inner: "pubkey" }, zeroCopyBool: false };
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression();
      if (Node.isPropertyAccessExpression(expression) && isCpiSol(expression.getExpression()) && expression.getName() === "timestamp") {
        return { kind: "value", type: "i64", zeroCopyBool: false };
      }
    }
    return undefined;
  }

  private inferPropertyType(baseType: InferredType | undefined, property: string): InferredType | undefined {
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
    return undefined;
  }

  private inferNumericBinaryType(node: import("ts-morph").BinaryExpression): InferredType | undefined {
    const operator = node.getOperatorToken().getText();
    if (["===", "!==", "==", "!=", ">", ">=", "<", "<=", "&&", "||"].includes(operator)) return { kind: "value", type: "bool", zeroCopyBool: false };
    return this.inferExpressionType(node.getLeft()) ?? this.inferExpressionType(node.getRight());
  }

  private inferAssignmentTargetType(node: Node): InferredType | undefined {
    if (Node.isIdentifier(node)) return this.inferExpressionType(node);
    if (Node.isNonNullExpression(node)) return this.inferAssignmentTargetType(node.getExpression());
    if (Node.isPropertyAccessExpression(node)) return this.inferPropertyType(this.inferExpressionType(node.getExpression()), node.getName());
    if (Node.isElementAccessExpression(node)) return this.inferExpressionType(node);
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
    throw new Error(`Instruction '${this.ix.name}' requires unknown error '${errorName}'. Add it to program.errors or use one of: ${available}. Offending code: ${node.getText()}.`);
  }

  private assertEventPayload(eventName: string, payload: ObjectLiteralExpression, fields: readonly IrAccountField[]): void {
    const expected = new Set(fields.map((field) => field.name));
    const provided = new Set<string>();

    for (const property of payload.getProperties()) {
      if (Node.isSpreadAssignment(property)) this.unsupported("object spread", property, "Write every event payload field explicitly.");
      const name = Node.isShorthandPropertyAssignment(property)
        ? property.getName()
        : Node.isPropertyAssignment(property)
          ? property.getName().replace(/^['"]|['"]$/g, "")
          : undefined;
      if (name === undefined) this.unsupported(`event payload property '${property.getKindName()}'`, property);
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

  private isAssignmentOperator(operator: string): operator is AssignmentOperator {
    return operator === "=" || operator === "+=" || operator === "-=" || operator === "*=" || operator === "/=";
  }

  private isPropertyName(node: import("ts-morph").Identifier): boolean {
    const parent = node.getParent();
    return Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node;
  }

  private assertKnownProperty(baseType: InferredType | undefined, property: string, node: Node): void {
    if (baseType?.kind !== "account") return;
    const constraint = baseType.symbol.account.constraint.kind;
    if (constraint === "tokenAccount" || constraint === "mint" || constraint === "clock") return;
    const accountDef = baseType.symbol.accountDef;
    if (accountDef === undefined) return;
    if (accountDef.fields.some((field) => field.name === property)) return;
    this.unsupported(`unknown field '${property}' on account '${accountDef.name}'`, node, `Use one of: ${accountDef.fields.map((field) => field.name).join(", ")}.`);
  }

  private unsupported(feature: string, node: Node | undefined, guidance?: string): never {
    const snippet = node?.getText().replace(/\s+/g, " ").slice(0, 160) ?? feature;
    const suffix = guidance === undefined ? "" : ` ${guidance}`;
    throw new Error(`Instruction '${this.ix.name}' uses unsupported TypeScript: ${feature}. Offending code: ${snippet}.${suffix}`);
  }

  private getForLoopVariable(initializer: import("ts-morph").ForStatement["getInitializer"] extends () => infer T ? NonNullable<T> : never): string | undefined {
    if (Node.isVariableDeclarationList(initializer)) return initializer.getDeclarations()[0]?.getName();
    if (Node.isBinaryExpression(initializer) && Node.isIdentifier(initializer.getLeft())) return initializer.getLeft().getText();
    return undefined;
  }

  private getForLoopStart(initializer: import("ts-morph").ForStatement["getInitializer"] extends () => infer T ? NonNullable<T> : never): string | undefined {
    if (Node.isVariableDeclarationList(initializer)) {
      const init = initializer.getDeclarations()[0]?.getInitializer();
      return init === undefined ? "0" : this.renderExpression(init, "value");
    }
    if (Node.isBinaryExpression(initializer)) return this.renderExpression(initializer.getRight(), "value");
    return undefined;
  }

  private getForLoopEnd(condition: Expression): string | undefined {
    if (!Node.isBinaryExpression(condition)) return undefined;
    return this.renderExpression(condition.getRight(), "value");
  }
}
