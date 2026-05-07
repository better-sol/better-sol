export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  public static invalid(message: string): ApiError {
    return new ApiError(message, 400);
  }

  public static unauthorized(): ApiError {
    return new ApiError("missing or invalid API key", 401);
  }

  public static buildFailed(logs: string): ApiError {
    return new ApiError(logs, 422);
  }

  public static internal(cause: string): ApiError {
    return new ApiError(cause, 500);
  }

  public toResponse(): Response {
    return Response.json({ error: this.message }, { status: this.status });
  }
}
