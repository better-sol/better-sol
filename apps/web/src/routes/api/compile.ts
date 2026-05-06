import { db } from "#/db/db.server.ts";
import {
  apiKeysTable,
  compileResultsTable,
  programsTable,
  rateLimitsTable,
} from "#/db/schema.ts";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { decryptValue } from "#/functions/crypto.functions";
import { z } from "zod";

const RequestSchema = z.object({
  apiKey: z.string().optional(),
  name: z.string().regex(/^[a-zA-Z0-9_]+$/).min(1),
  programId: z.string().min(32).max(44),
  version: z.string().min(1),
  libRs: z.string().min(1).max(1_500_000),
  cargoToml: z.string().optional(),
  idl: z.unknown().optional(),
});

const COMPILER_URL =
  process.env.COMPILER_API_URL ?? "https://api.better-sol.dev";

const ANONYMOUS_LIMIT_PER_HOUR = 3;
const AUTHENTICATED_LIMIT_PER_HOUR = 50;

type CompilerResponse = {
  readonly status: "success" | "failed";
  readonly compile_time_ms: number;
  readonly bytecode: string | null;
  readonly cargo_toml: string;
  readonly logs: string;
};

async function checkAndIncrementRateLimit(
  identifier: string,
  limit: number,
): Promise<boolean> {
  const [row] = await db
    .select({
      count: rateLimitsTable.count,
      windowStart: rateLimitsTable.windowStart,
    })
    .from(rateLimitsTable)
    .where(eq(rateLimitsTable.identifier, identifier));

  if (row === undefined) {
    await db.insert(rateLimitsTable).values({ identifier });
    return true;
  }

  const oneHourAgo = new Date(Date.now() - 3_600_000);

  if (row.windowStart < oneHourAgo) {
    await db
      .update(rateLimitsTable)
      .set({ count: 1, windowStart: sql`now()` })
      .where(eq(rateLimitsTable.identifier, identifier));
    return true;
  }

  if (row.count >= limit) {
    return false;
  }

  await db
    .update(rateLimitsTable)
    .set({ count: sql`${rateLimitsTable.count} + 1` })
    .where(eq(rateLimitsTable.identifier, identifier));

  return true;
}

export const Route = createFileRoute("/api/compile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = RequestSchema.safeParse(await request.json());

        if (!parsed.success) {
          return Response.json(
            { error: z.treeifyError(parsed.error) },
            { status: 400 },
          );
        }

        const data = parsed.data;
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";

        let accountAddress: string | undefined;
        let apiKeyId: string | undefined;

        if (data.apiKey !== undefined) {
          const keyPrefix = data.apiKey.slice(0, 12);

          const candidates = await db
            .select({
              id: apiKeysTable.id,
              accountAddress: apiKeysTable.accountAddress,
              keyEncrypted: apiKeysTable.keyEncrypted,
            })
            .from(apiKeysTable)
            .where(eq(apiKeysTable.keyPrefix, keyPrefix));

          for (const candidate of candidates) {
            const decrypted = await decryptValue({
              data: { encrypted: candidate.keyEncrypted },
            });
            if (decrypted === data.apiKey) {
              accountAddress = candidate.accountAddress;
              apiKeyId = candidate.id;
              break;
            }
          }

          if (accountAddress === undefined || apiKeyId === undefined) {
            return Response.json(
              { error: "Invalid API key" },
              { status: 401 },
            );
          }

          await db
            .update(apiKeysTable)
            .set({ lastUsedAt: sql`now()` })
            .where(eq(apiKeysTable.id, apiKeyId));
        }

        const rateLimitId = accountAddress ?? `ip:${ip}`;
        const rateLimit = accountAddress !== undefined
          ? AUTHENTICATED_LIMIT_PER_HOUR
          : ANONYMOUS_LIMIT_PER_HOUR;

        const withinLimit = await checkAndIncrementRateLimit(
          rateLimitId,
          rateLimit,
        );

        if (!withinLimit) {
          return Response.json(
            { error: "Rate limit exceeded. Create an API key for higher limits." },
            { status: 429 },
          );
        }

        const compilerResponse = await fetch(`${COMPILER_URL}/compile`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            program_id: data.programId,
            version: data.version,
            lib_rs: data.libRs,
            cargo_toml: data.cargoToml,
          }),
        });

        if (!compilerResponse.ok) {
          return Response.json(
            { error: await compilerResponse.text() },
            { status: 502 },
          );
        }

        const result = (await compilerResponse.json()) as CompilerResponse;

        await db
          .insert(programsTable)
          .values({ programId: data.programId, name: data.name })
          .onConflictDoUpdate({
            target: programsTable.programId,
            set: { name: sql`EXCLUDED.name` },
          });

        const [row] = await db
          .insert(compileResultsTable)
          .values({
            programId: data.programId,
            accountAddress,
            apiKeyId,
            version: data.version,
            status: result.status,
            compileTimeMs: result.compile_time_ms,
          })
          .returning({ id: compileResultsTable.id });

        const bucket = env.BETTER_SOL_BUCKET;
        const prefix = `compile-results/${row.id}`;

        const r2Uploads: Promise<unknown>[] = [
          bucket.put(`${prefix}/lib.rs`, data.libRs),
          bucket.put(`${prefix}/Cargo.toml`, result.cargo_toml),
          bucket.put(`${prefix}/logs.txt`, result.logs),
        ];

        if (result.bytecode !== null) {
          const bytes = Uint8Array.from(atob(result.bytecode), (c) =>
            c.charCodeAt(0),
          );
          r2Uploads.push(bucket.put(`${prefix}/bytecode.so`, bytes));
        }

        if (data.idl !== undefined) {
          r2Uploads.push(
            bucket.put(`${prefix}/idl.json`, JSON.stringify(data.idl)),
          );
        }

        await Promise.all(r2Uploads);

        return Response.json(
          {
            id: row.id,
            status: result.status,
            compileTimeMs: result.compile_time_ms,
            bytecode: result.bytecode,
          },
          { status: 201 },
        );
      },
    },
  },
});
