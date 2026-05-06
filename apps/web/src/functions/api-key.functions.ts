import { db } from "#/db/db.server.ts";
import { apiKeysTable } from "#/db/schema.ts";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { decryptValue, encryptValue, generateToken } from "./crypto.functions";

function requireAccountAddress(accountAddress: string | undefined): string {
  if (!accountAddress) {
    throw new Error("Authentication required");
  }
  return accountAddress;
}

const CreateApiKeySchema = z.object({
  accountAddress: z.string().optional(),
  name: z.string().max(32).optional(),
  expiresAt: z.iso.datetime().optional(),
});

export const createApiKey = createServerFn({ method: "POST" })
  .inputValidator(CreateApiKeySchema)
  .handler(async ({ data: { accountAddress, name, expiresAt } }) => {
    const address = requireAccountAddress(accountAddress);
    const rawKey = await generateToken({ data: { prefix: "bsk" } });
    const { encrypted } = await encryptValue({ data: { value: rawKey } });
    const displayName = name?.trim() || "Better Sol Key";

    const [row] = await db
      .insert(apiKeysTable)
      .values({
        accountAddress: address,
        name: displayName,
        keyEncrypted: encrypted,
        keyPrefix: rawKey.slice(0, 12),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning({ id: apiKeysTable.id });

    return {
      id: row.id,
      name: displayName,
      key: rawKey,
      prefix: rawKey.slice(0, 12),
    };
  });

const ListApiKeysSchema = z.object({
  accountAddress: z.string().optional(),
});

export const listApiKeys = createServerFn({ method: "POST" })
  .inputValidator(ListApiKeysSchema)
  .handler(async ({ data: { accountAddress } }) => {
    const address = requireAccountAddress(accountAddress);

    await db
      .update(apiKeysTable)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          lte(apiKeysTable.expiresAt, sql`now()`),
          isNull(apiKeysTable.deletedAt),
        ),
      );

    const activeKeys = await db
      .select({
        id: apiKeysTable.id,
        name: apiKeysTable.name,
        keyPrefix: apiKeysTable.keyPrefix,
        expiresAt: apiKeysTable.expiresAt,
        lastUsedAt: apiKeysTable.lastUsedAt,
        createdAt: apiKeysTable.createdAt,
      })
      .from(apiKeysTable)
      .where(
        and(
          eq(apiKeysTable.accountAddress, address),
          isNull(apiKeysTable.deletedAt),
        ),
      );

    return activeKeys;
  });

export const revealApiKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const [row] = await db
      .select({ keyEncrypted: apiKeysTable.keyEncrypted })
      .from(apiKeysTable)
      .where(eq(apiKeysTable.id, id));

    if (row === undefined) {
      return { key: null };
    }

    const key = await decryptValue({ data: { encrypted: row.keyEncrypted } });
    return { key };
  });

const RevokeApiKeySchema = z.object({
  id: z.uuid(),
  accountAddress: z.string().optional(),
});

export const revokeApiKey = createServerFn({ method: "POST" })
  .inputValidator(RevokeApiKeySchema)
  .handler(async ({ data: { id, accountAddress } }) => {
    const address = requireAccountAddress(accountAddress);
    const [row] = await db
      .update(apiKeysTable)
      .set({ deletedAt: sql`now()` })
      .where(
        and(eq(apiKeysTable.id, id), eq(apiKeysTable.accountAddress, address)),
      )
      .returning({ id: apiKeysTable.id });

    return { success: row !== undefined };
  });

const ValidateApiKeySchema = z.object({ rawKey: z.string() });

export const validateApiKey = createServerFn({ method: "POST" })
  .inputValidator(ValidateApiKeySchema)
  .handler(async ({ data: { rawKey } }) => {
    const keyPrefix = rawKey.slice(0, 12);

    await db
      .update(apiKeysTable)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          lte(apiKeysTable.expiresAt, sql`now()`),
          isNull(apiKeysTable.deletedAt),
        ),
      );

    const candidates = await db
      .select({
        id: apiKeysTable.id,
        accountAddress: apiKeysTable.accountAddress,
        keyEncrypted: apiKeysTable.keyEncrypted,
      })
      .from(apiKeysTable)
      .where(
        and(
          eq(apiKeysTable.keyPrefix, keyPrefix),
          isNull(apiKeysTable.deletedAt),
        ),
      );

    for (const candidate of candidates) {
      const decrypted = await decryptValue({
        data: { encrypted: candidate.keyEncrypted },
      });
      if (decrypted === rawKey) {
        return { accountId: candidate.accountAddress, keyId: candidate.id };
      }
    }

    return null;
  });
