import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { randomUUIDv7 } from "#/lib/uuid.ts";

export const accountsTable = pgTable(
  "accounts",
  {
    address: text().primaryKey(),
    displayName: text(),
    avatarUrl: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index("accounts_last_seen_idx").on(table.lastSeenAt)],
);

export const accountsRelations = relations(accountsTable, ({ many }) => ({
  apiKeys: many(apiKeysTable),
  compileResults: many(compileResultsTable),
}));

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: text().primaryKey().$defaultFn(randomUUIDv7),
    accountAddress: text()
      .notNull()
      .references(() => accountsTable.address),
    name: text().notNull(),
    keyEncrypted: text().notNull(),
    keyPrefix: text().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("api_keys_account_idx").on(table.accountAddress),
    index("api_keys_prefix_idx").on(table.keyPrefix),
  ],
);

export const apiKeysRelations = relations(apiKeysTable, ({ one, many }) => ({
  account: one(accountsTable, {
    fields: [apiKeysTable.accountAddress],
    references: [accountsTable.address],
  }),
  compileResults: many(compileResultsTable),
}));

export const programsTable = pgTable(
  "programs",
  {
    programId: text().primaryKey(),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
);

export const programsRelations = relations(programsTable, ({ many }) => ({
  compileResults: many(compileResultsTable),
}));

export const rateLimitsTable = pgTable(
  "rate_limits",
  {
    identifier: text().primaryKey(),
    count: integer().notNull().default(1),
    windowStart: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
);

export const compileStatusEnum = pgEnum("compile_status", [
  "success",
  "failed",
  "timeout",
]);

export const compileResultsTable = pgTable(
  "compile_results",
  {
    id: text().primaryKey().$defaultFn(randomUUIDv7),
    programId: text()
      .notNull()
      .references(() => programsTable.programId),
    accountAddress: text().references(() => accountsTable.address),
    apiKeyId: text().references(() => apiKeysTable.id),
    version: text().notNull(),
    status: compileStatusEnum().notNull(),
    compileTimeMs: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("compile_results_program_idx").on(table.programId),
    index("compile_results_account_idx").on(table.accountAddress),
    index("compile_results_api_key_idx").on(table.apiKeyId),
    index("compile_results_created_at_idx").on(table.createdAt),
  ],
);

export const compileResultsRelations = relations(
  compileResultsTable,
  ({ one }) => ({
    program: one(programsTable, {
      fields: [compileResultsTable.programId],
      references: [programsTable.programId],
    }),
    account: one(accountsTable, {
      fields: [compileResultsTable.accountAddress],
      references: [accountsTable.address],
    }),
    apiKey: one(apiKeysTable, {
      fields: [compileResultsTable.apiKeyId],
      references: [apiKeysTable.id],
    }),
  }),
);

