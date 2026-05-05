import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { randomUUIDv7 } from "#/lib/uuid.ts";

const cascadeAction = "cascade";

export const accountsTable = pgTable(
  "accounts",
  {
    address: text().primaryKey(),
    displayName: text(),
    avatarUrl: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("accounts_last_seen_idx").on(table.lastSeenAt)],
);

export const accountsRelations = relations(accountsTable, ({ many }) => ({
  apiKeys: many(apiKeysTable),
}));

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: text().primaryKey().$defaultFn(randomUUIDv7),
    accountAddress: text()
      .notNull()
      .references(() => accountsTable.address, { onDelete: cascadeAction }),
    name: text().notNull(),
    keyEncrypted: text().notNull(),
    keyPrefix: text().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("api_keys_account_idx").on(table.accountAddress),
    index("api_keys_prefix_idx").on(table.keyPrefix),
  ],
);

export const apiKeysRelations = relations(apiKeysTable, ({ one }) => ({
  account: one(accountsTable, {
    fields: [apiKeysTable.accountAddress],
    references: [accountsTable.address],
  }),
}));

