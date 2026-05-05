import { drizzle } from "drizzle-orm/neon-http";
import { env } from "cloudflare:workers";

export const db = drizzle(env.DATABASE_URL);
