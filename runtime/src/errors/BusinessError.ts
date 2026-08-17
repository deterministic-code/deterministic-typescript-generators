/**
 * Error raised by business-logic services when a rule is violated.
 * Distinct from {@link AppError} — auth middlewares throw this and the
 * `errorHandler` middleware maps it to the supplied HTTP status + code.
 *
 * @param statusCode  HTTP status to return (e.g., 401, 403, 409).
 * @param message     Human-readable message; rendered to the API consumer.
 * @param code        Optional machine-readable code; defaults to `"BUSINESS_ERROR"`
 *                    when the errorHandler renders the response.
 *
 * @example
 * throw new BusinessError(401, "Invalid or expired token", "INVALID_TOKEN");
 */
export class BusinessError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'BusinessError';
    Object.setPrototypeOf(this, BusinessError.prototype);
  }
}
