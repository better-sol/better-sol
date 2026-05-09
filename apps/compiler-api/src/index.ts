import { env } from "./env";
import { compile, type CompileOutput } from "./compile";
import { ApiError } from "./errors";

function requireApiKey(req: Request): void {
  const key = req.headers.get("x-api-key");
  if (key !== env.COMPILER_API_KEY) throw ApiError.unauthorized();
}

async function handleCompileRequest(req: Request): Promise<Response> {
  requireApiKey(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw ApiError.invalid("request body must be valid JSON");
  }

  const result: CompileOutput = await compile(body);
  return Response.json(result);
}

const server = Bun.serve({
  port: env.PORT,
  maxRequestBodySize: env.MAX_BODY_BYTES,
  idleTimeout: env.REQUEST_TIMEOUT_SECS,

  routes: {
    "/health": () => Response.json({ status: "ok" }),

    "/compile": {
      POST: handleCompileRequest,
    },
  },

  error(error: Error): Response {
    if (error instanceof ApiError) return error.toResponse();

    console.error(error);
    return ApiError.internal(error.message).toResponse();
  },
});

console.log(`compiler-api listening on ${server.url}`);
