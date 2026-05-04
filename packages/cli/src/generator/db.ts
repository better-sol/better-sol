import { writeFile } from "node:fs/promises";
import { ensureParent } from "../path";
import { type IrProgram, type IrAccountField, type IrType } from "../ir/types";
import { toSnake, toCamel } from "../naming";

type DbDialect = "postgres" | "mysql" | "sqlite";

export function isDbDialect(value: string): value is DbDialect {
  return value === "postgres" || value === "mysql" || value === "sqlite";
}

interface GeneratedSchema {
  readonly imports: readonly string[];
  readonly tables: readonly string[];
}

export function generateDrizzleSchema(programs: readonly IrProgram[], dialect: DbDialect): string {
  const schema = programs.reduce<GeneratedSchema>(
    (acc, program) => {
      const programTables = program.accounts.map((account) => renderTableWithDeps(program.name, account.name, account.fields, dialect));
      return {
        imports: [...acc.imports, ...programTables.flatMap((t) => t.imports)],
        tables: [...acc.tables, ...programTables.map((t) => t.code)],
      };
    },
    { imports: [], tables: [] },
  );

  const baseImports = [drizzleBaseImport(dialect)];
  const uniqueExtraImports = [...new Set(schema.imports)];
  return [...baseImports, ...uniqueExtraImports, "", ...schema.tables].join("\n\n");
}

export async function writeDrizzleSchema(path: string, programs: readonly IrProgram[], dialect: DbDialect): Promise<void> {
  await ensureParent(path);
  await writeFile(path, generateDrizzleSchema(programs, dialect));
}

function drizzleBaseImport(dialect: DbDialect): string {
  if (dialect === "mysql") return "import { bigint, boolean, mysqlTable, varchar } from \"drizzle-orm/mysql-core\";";
  if (dialect === "sqlite") return "import { blob, integer, sqliteTable, text } from \"drizzle-orm/sqlite-core\";";
  return "import { bigint, boolean, jsonb, pgTable, text } from \"drizzle-orm/pg-core\";";
}

interface TableCode {
  readonly imports: readonly string[];
  readonly code: string;
}

function renderTableWithDeps(programName: string, accountName: string, fields: readonly IrAccountField[], dialect: DbDialect): TableCode {
  const tableFunction = dialect === "mysql" ? "mysqlTable" : dialect === "sqlite" ? "sqliteTable" : "pgTable";
  const tableName = `${toSnake(programName)}_${toSnake(accountName)}`;
  const exportName = `${toCamel(programName)}${accountName}`;
  const nameArg = `"${tableName}"`;

  const columnResults = fields.map((field) => renderTypedColumn(field, dialect));
  const extraImports = columnResults.flatMap((r) => r.imports);
  const columns = [
    renderAddressColumn(dialect),
    ...columnResults.map((r) => r.code),
    renderUpdatedAtSlotColumn(dialect),
    renderUpdatedAtColumn(dialect),
  ].join(",\n");

  return {
    imports: [...new Set(extraImports)],
    code: `export const ${exportName} = ${tableFunction}(${nameArg}, {\n${columns}\n});`,
  };
}

interface ColumnCode {
  readonly imports: readonly string[];
  readonly code: string;
}

function renderTypedColumn(field: IrAccountField, dialect: DbDialect): ColumnCode {
  return renderType(field.type, field.name, dialect);
}

function renderType(type: IrType, fieldName: string, dialect: DbDialect): ColumnCode {
  const col = toSnake(fieldName);

  if (typeof type === "string") {
    return renderPrimitive(type, fieldName, col, dialect);
  }

  if (type.kind === "option") {
    return renderOption(type.inner, fieldName, col, dialect);
  }

  if (type.kind === "vec") {
    return renderVector(type.inner, fieldName, col, dialect);
  }

  if (type.kind === "array") {
    return renderArray(type.inner, type.size, fieldName, col, dialect);
  }

  return jsonFallback(col, fieldName);
}

function renderPrimitive(kind: string, fieldName: string, column: string, dialect: DbDialect): ColumnCode {
  if (kind === "bool") {
    if (dialect === "sqlite") return { imports: [], code: `  ${fieldName}: integer("${column}").notNull()` };
    return { imports: [], code: `  ${fieldName}: boolean("${column}").notNull()` };
  }
  if (kind === "pubkey" || kind === "string") {
    if (dialect === "mysql") return { imports: [], code: `  ${fieldName}: varchar("${column}", { length: 255 }).notNull()` };
    return { imports: [], code: `  ${fieldName}: text("${column}").notNull()` };
  }
  if (kind === "bytes") {
    if (dialect === "sqlite") return { imports: [], code: `  ${fieldName}: blob("${column}").notNull()` };
    return { imports: [], code: `  ${fieldName}: text("${column}").notNull()` };
  }
  if (kind === "u8" || kind === "i8" || kind === "u16" || kind === "i16") {
    if (dialect === "sqlite") return { imports: [], code: `  ${fieldName}: integer("${column}").notNull()` };
    return { imports: [], code: `  ${fieldName}: integer("${column}").notNull()` };
  }
  if (dialect === "sqlite") return { imports: [], code: `  ${fieldName}: integer("${column}").notNull()` };
  return { imports: [], code: `  ${fieldName}: bigint("${column}", { mode: "bigint" }).notNull()` };
}

function renderOption(inner: IrType, fieldName: string, _column: string, dialect: DbDialect): ColumnCode {
  const innerResult = renderType(inner, fieldName, dialect);
  const notNullIdx = innerResult.code.lastIndexOf(".notNull()");
  const nullableCode = notNullIdx !== -1 ? innerResult.code.slice(0, notNullIdx) : innerResult.code;
  return { imports: innerResult.imports, code: nullableCode };
}

function renderVector(inner: IrType, fieldName: string, column: string, dialect: DbDialect): ColumnCode {
  if (dialect === "postgres" && isWrappable(inner)) {
    const base = renderType(inner, fieldName, dialect);
    const notNullIdx = base.code.lastIndexOf(".notNull()");
    const cleanBase = notNullIdx !== -1 ? base.code.slice(0, notNullIdx) : base.code;
    return { imports: base.imports, code: `${cleanBase}.array().notNull()` };
  }
  return jsonFallback(column, fieldName);
}

function renderArray(inner: IrType, _size: number, fieldName: string, column: string, dialect: DbDialect): ColumnCode {
  if (dialect === "postgres" && isWrappable(inner)) {
    const base = renderType(inner, fieldName, dialect);
    const notNullIdx = base.code.lastIndexOf(".notNull()");
    const cleanBase = notNullIdx !== -1 ? base.code.slice(0, notNullIdx) : base.code;
    return { imports: base.imports, code: `${cleanBase}.array().notNull()` };
  }
  return jsonFallback(column, fieldName);
}

function isWrappable(type: IrType): boolean {
  if (typeof type === "string") return true;
  if (type.kind === "option") return isWrappable(type.inner);
  return false;
}

function jsonFallback(column: string, fieldName: string): ColumnCode {
  return { imports: [], code: `  ${fieldName}: text("${column}")` };
}

function renderAddressColumn(dialect: DbDialect): string {
  if (dialect === "mysql") return '  address: varchar("address", { length: 44 }).primaryKey()';
  return '  address: text("address").primaryKey()';
}

function renderUpdatedAtSlotColumn(dialect: DbDialect): string {
  if (dialect === "sqlite") return '  updatedAtSlot: integer("updated_at_slot").notNull()';
  return '  updatedAtSlot: bigint("updated_at_slot", { mode: "bigint" }).notNull()';
}

function renderUpdatedAtColumn(dialect: DbDialect): string {
  if (dialect === "sqlite") return '  updatedAt: integer("updated_at").notNull()';
  return '  updatedAt: bigint("updated_at", { mode: "bigint" }).notNull()';
}
