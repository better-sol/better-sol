import { db } from "#/db/db.server.ts";
import { accountsTable } from "#/db/schema.ts";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import { z } from "zod";

const SaveAccountSchema = z.object({
  address: z.string(),
});

export const saveAccount = createServerFn({ method: "POST" })
  .inputValidator(SaveAccountSchema)
  .handler(async ({ data: { address } }) => {
    await db
      .insert(accountsTable)
      .values({ address })
      .onConflictDoUpdate({
        target: accountsTable.address,
        set: { lastSeenAt: sql`now()` },
      });

    return { success: true };
  });
