import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(8080),
    MAX_BODY_BYTES: z.coerce.number().default(2 * 1024 * 1024),
    REQUEST_TIMEOUT_SECS: z.coerce.number().default(30),
    BUILD_TIMEOUT_SECS: z.coerce.number().default(120),
    ENABLE_BUILD: z.coerce.boolean().default(false),
  },

  runtimeEnv: Bun.env,

  emptyStringAsUndefined: true,
});
