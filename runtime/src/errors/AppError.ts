/**
 * Base HTTP error carrying a status code and a machine-readable error code.
 * Thrown anywhere in the pipeline and rendered by the `errorHandler` middleware.
 *
 * @example
 * throw new AppError(418, "IM_A_TEAPOT", "short and stout");
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * 404 Not Found. Use when a requested resource does not exist.
 * @param message Optional custom message; defaults to `"Resource not found"`.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

/**
 * 400 Bad Request for input that fails validation outside of Zod.
 * @param message Optional custom message; defaults to `"Validation failed"`.
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

/**
 * 409 Conflict for duplicate-key or state-conflict failures.
 * @param message Optional custom message; defaults to `"Resource conflict"`.
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(409, 'CONFLICT', message);
    this.name = 'ConflictError';
  }
}

/**
 * 412 Precondition Failed for a stale optimistic-concurrency token (the `If-Match`
 * value no longer matches the row's current version). RFC 9110 §13.1.1 — distinct from
 * a 428 missing-header (`PRECONDITION_REQUIRED`) and from a 409 duplicate-key conflict.
 * @param message Optional custom message; defaults to `"Precondition failed"`.
 */
export class PreconditionFailedError extends AppError {
  constructor(message = 'Precondition failed') {
    super(412, 'PRECONDITION_FAILED', message);
    this.name = 'PreconditionFailedError';
  }
}
