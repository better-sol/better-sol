import { env } from "./env";
import { compile, type CompileOutput } from "./compile";
import { ApiError } from "./errors";

const server = Bun.serve({
  port: env.PORT,
  maxRequestBodySize: env.MAX_BODY_BYTES,
  idleTimeout: env.REQUEST_TIMEOUT_SECS,

  routes: {
    "/health": () => Response.json({ status: "ok" }),

    "/compile": {
      POST: async (req): Promise<Response> => {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          throw ApiError.invalid("request body must be valid JSON");
        }

        const result: CompileOutput = await compile(body);
        return Response.json(result);
      },
    },
  },

  error(error: Error): Response {
    if (error instanceof ApiError) return error.toResponse();

    console.error(error);
    return ApiError.internal(error.message).toResponse();
  },
});

console.log(`compiler-api listening on ${server.url}`);
