import { writeFile } from "node:fs/promises";
import { ensureParent } from "../path";
import { type IrProgram, type IrAccountField } from "../ir/types";
import { toSnake, toCamel } from "../naming";

type DbDialect = "postgres" | "mysql" | "sqlite";

export function isDbDialect(value: string): value is DbDialect {
  return value === "postgres" || value === "mysql" || value === "sqlite";
}

function generateDrizzleSchema(programs: readonly IrProgram[], dialect: DbDialect): string {
  const importLine = drizzleImport(dialect);
  const tables = programs.flatMap((program) => program.accounts.map((account) => renderTable(program.name, account.name, account.fields, dialect)));
  return [importLine, "", ...tables].join("\n\n");
}

export async function writeDrizzleSchema(path: string, programs: readonly IrProgram[], dialect: DbDialect): Promise<void> {
  await ensureParent(path);
  await writeFile(path, generateDrizzleSchema(programs, dialect));
}

function drizzleImport(dialect: DbDialect): string {
  if (dialect === "mysql") return "import { bigint, boolean, mysqlTable, varchar } from \"drizzle-orm/mysql-core\";";
  if (dialect === "sqlite") return "import { blob, integer, sqliteTable, text } from \"drizzle-orm/sqlite-core\";";
  return "import { bigint, boolean, pgTable, text } from \"drizzle-orm/pg-core\";";
}

function renderTable(programName: string, accountName: string, fields: readonly IrAccountField[], dialect: DbDialect): string {
  const tableFunction = dialect === "mysql" ? "mysqlTable" : dialect === "sqlite" ? "sqliteTable" : "pgTable";
  const tableName = `${toSnake(programName)}_${toSnake(accountName)}`;
  const exportName = `${toCamel(programName)}${accountName}`;
  const columns = [
    renderAddressColumn(dialect),
    ...fields.map((field) => renderColumn(field, dialect)),
    renderUpdatedAtSlotColumn(dialect),
    renderUpdatedAtColumn(dialect),
  ].join("\n");

  return `export const ${exportName} = ${tableFunction}("${tableName}", {\n${columns}\n});`;
}

function renderAddressColumn(dialect: DbDialect): string {
  if (dialect === "mysql") return "  address: varchar(\"address\", { length: 44 }).primaryKey(),";
  return "  address: text(\"address\").primaryKey(),";
}

function renderUpdatedAtSlotColumn(dialect: DbDialect): string {
  if (dialect === "sqlite") return "  updatedAtSlot: integer(\"updated_at_slot\").notNull(),";
  return "  updatedAtSlot: bigint(\"updated_at_slot\", { mode: \"bigint\" }).notNull(),";
}

function renderUpdatedAtColumn(dialect: DbDialect): string {
  if (dialect === "sqlite") return "  updatedAt: integer(\"updated_at\").notNull(),";
  return "  updatedAt: bigint(\"updated_at\", { mode: \"bigint\" }).notNull(),";
}

function renderColumn(field: IrAccountField, dialect: DbDialect): string {
  const column = toSnake(field.name);
  const typeStr = typeof field.type === "string" ? field.type : field.type.kind;
  if (typeStr === "bool") return `  ${field.name}: ${dialect === "sqlite" ? "integer" : "boolean"}("${column}").notNull(),`;
  if (typeStr === "pubkey" || typeStr === "string") {
    if (dialect === "mysql") return `  ${field.name}: varchar("${column}", { length: 255 }).notNull(),`;
    return `  ${field.name}: text("${column}").notNull(),`;
  }
  if (typeStr === "bytes") return dialect === "sqlite" ? `  ${field.name}: blob("${column}").notNull(),` : `  ${field.name}: text("${column}").notNull(),`;
  if (typeStr === "vec" || typeStr === "option" || typeStr === "array") return `  ${field.name}: text("${column}"),`;
  if (dialect === "sqlite") return `  ${field.name}: integer("${column}").notNull(),`;
  return `  ${field.name}: bigint("${column}", { mode: "bigint" }).notNull(),`;
}
