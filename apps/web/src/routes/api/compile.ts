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
  name: z.string().regex(/^[a-zA-Z0-9_]+$/).min(1),
  programId: z.string().min(32).max(44),
  version: z.string().min(1),
  libRs: z.string().min(1).max(1_500_000),
  cargoToml: z.string().min(1),
  idl: z.unknown(),
});

const COMPILER_URL =
  process.env.COMPILER_API_URL ?? "https://api.better-sol.fun";

const COMPILER_API_KEY = process.env.COMPILER_API_KEY;

const ANONYMOUS_LIMIT_PER_HOUR = 3;
const AUTHENTICATED_LIMIT_PER_HOUR = 50;

type CompilerResponse = {
  readonly status: "success" | "failed";
  readonly compileTimeMs: number;
  readonly bytecode: string | null;
  readonly cargoToml: string;
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

async function authenticate(
  apiKey: string,
): Promise<{ accountAddress: string; apiKeyId: string }> {
  const keyPrefix = apiKey.slice(0, 12);

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
    if (decrypted === apiKey) {
      await db
        .update(apiKeysTable)
        .set({ lastUsedAt: sql`now()` })
        .where(eq(apiKeysTable.id, candidate.id));
      return {
        accountAddress: candidate.accountAddress,
        apiKeyId: candidate.id,
      };
    }
  }

  throw new Error("Invalid API key");
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
        const apiKey = request.headers.get("x-api-key");

        let accountAddress: string | undefined;
        let apiKeyId: string | undefined;
        let rateLimitId: string;
        let rateLimit: number;

        if (apiKey !== null) {
          try {
            const auth = await authenticate(apiKey);
            accountAddress = auth.accountAddress;
            apiKeyId = auth.apiKeyId;
            rateLimitId = accountAddress;
            rateLimit = AUTHENTICATED_LIMIT_PER_HOUR;
          } catch {
            return Response.json(
              { error: "Invalid API key" },
              { status: 401 },
            );
          }
        } else {
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            "unknown";
          rateLimitId = `ip:${ip}`;
          rateLimit = ANONYMOUS_LIMIT_PER_HOUR;
        }

        const withinLimit = await checkAndIncrementRateLimit(
          rateLimitId,
          rateLimit,
        );

        if (!withinLimit) {
          return Response.json(
            { error: "Rate limit exceeded" },
            { status: 429 },
          );
        }

        const compilerResponse = await fetch(`${COMPILER_URL}/compile`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(COMPILER_API_KEY !== undefined ? { "x-api-key": COMPILER_API_KEY } : {}),
          },
          body: JSON.stringify({
            name: data.name,
            programId: data.programId,
            version: data.version,
            libRs: data.libRs,
            cargoToml: data.cargoToml,
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
            compileTimeMs: result.compileTimeMs,
          })
          .returning({ id: compileResultsTable.id });

        const bucket = env.BETTER_SOL_BUCKET;
        const prefix = `compile-results/${row.id}`;

        const r2Uploads: Promise<unknown>[] = [
          bucket.put(`${prefix}/lib.rs`, data.libRs),
          bucket.put(`${prefix}/Cargo.toml`, result.cargoToml),
          bucket.put(`${prefix}/logs.txt`, result.logs),
          bucket.put(`${prefix}/idl.json`, JSON.stringify(data.idl)),
        ];

        if (result.bytecode !== null) {
          r2Uploads.push(
            bucket.put(
              `${prefix}/bytecode.so`,
              Uint8Array.from(atob(result.bytecode), (c) => c.charCodeAt(0)),
            ),
          );
        }

        await Promise.all(r2Uploads);

        return Response.json(
          {
            id: row.id,
            status: result.status,
            compileTimeMs: result.compileTimeMs,
            bytecode: result.bytecode,
          },
          { status: 201 },
        );
      },
    },
  },
});
