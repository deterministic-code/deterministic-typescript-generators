import type { ErrorRequestHandler } from 'express';
import { errorHandler } from './errorHandler';

/**
 * Terminal error-handler middleware contract. Wraps the shared
 * {@link errorHandler} so the mount point is owned by the service layer
 * rather than referenced directly by a composition root. The field is
 * `readonly` because the handler reference is captured at construction
 * time; reassigning it would defeat the purpose of wiring it through a
 * named service.
 */
export interface IErrorHandlerMiddlewareService {
  readonly handle: ErrorRequestHandler;
}

/**
 * Terminal error-handler middleware service. Thin wrapper around the
 * shared {@link errorHandler} exported from this package so composition
 * roots can mount it by class-name (e.g. through a YAML-driven handler
 * registry) instead of by function reference.
 *
 * Zero constructor args — same rationale as
 * {@link NotFoundMiddlewareService}.
 */
export class ErrorHandlerMiddlewareService implements IErrorHandlerMiddlewareService {
  static readonly dependencies: readonly never[] = [];

  readonly handle: ErrorRequestHandler = errorHandler;
}
