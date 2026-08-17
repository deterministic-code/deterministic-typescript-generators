import { Router, type RequestHandler, type Request, type Response } from 'express';
import type { ZodSchema } from 'zod';

import { sendItem, sendItems } from '../responses';
import { handleZodError } from '../errors/handleZodError';
import { handleBusinessError } from '../errors/handleBusinessError';

/**
 * HTTP verbs supported by `createGenericRouter`.
 */
export type GenericRouterMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Response envelope used by the generic router.
 * - `"item"`  → `sendItem(res, data, status)` (bare object)
 * - `"items"` → `sendItems(res, data)`        (`{ items: [...] }`)
 * - `"raw"`   → handler is responsible for writing the response itself
 *              (useful when a route must set headers / redirect / stream).
 */
export type GenericResponseFormat = 'item' | 'items' | 'raw';

/**
 * Configuration for a single non-CRUD route.
 *
 * Used for routes declared in `routes.yaml` that do not fit
 * `createCrudRouter` or `createReadOnlyRouter` — for example liveness
 * probes, JWKS endpoints, OpenID metadata documents, or any bespoke
 * service-backed handler.
 *
 * @typeParam TBody    Shape of the validated request body (or `unknown`
 *                     if no body schema is supplied).
 * @typeParam TResult  Shape of the value returned by `handler`.
 */
export interface GenericRouterOptions<TBody = unknown, TResult = unknown> {
  /** HTTP verb. */
  method: GenericRouterMethod;

  /** Mount path for the handler (e.g., `"/api/health"`). */
  path: string;

  /**
   * Async handler. Receives the Express request (with body already
   * validated if `requestSchema` was provided) and the response. The
   * resolved value is passed to the chosen response format.
   *
   * For `responseFormat: "raw"` the handler must write the response
   * itself; the returned value is ignored.
   */
  handler: (req: Request, res: Response) => Promise<TResult>;

  /**
   * Optional Zod schema used to validate `req.body` before the
   * handler runs. Zod failures are converted to the standard
   * `VALIDATION_ERROR` envelope via `handleZodError`.
   */
  requestSchema?: ZodSchema<TBody>;

  /**
   * Envelope used to send the handler's return value. Defaults to
   * `"item"`.
   */
  responseFormat?: GenericResponseFormat;

  /**
   * HTTP status to send on success. Defaults to `200` (or `201` for
   * `POST` with `responseFormat: "item"`).
   */
  statusCode?: number;

  /**
   * Middleware executed in order before the handler. Equivalent to
   * `mutationMiddleware` on `createCrudRouter` but applies to any
   * verb — typical uses are auth guards, rate limiters, or body
   * parsers specific to this route.
   */
  middleware?: RequestHandler[];
}

/**
 * Creates a router for a single non-CRUD route.
 *
 * Intended for routes in `routes.yaml` that call a service method and
 * return its result with the standard response envelope. Collapses the
 * boilerplate try/catch/next + `sendItem` pattern into one call.
 *
 * ```ts
 * app.use(createGenericRouter({
 *   method: "get",
 *   path: "/api/health",
 *   handler: () => healthCheckService.check(),
 * }));
 * ```
 *
 * For list endpoints, set `responseFormat: "items"`:
 *
 * ```ts
 * app.use(createGenericRouter({
 *   method: "get",
 *   path: "/oauth/public_keys",
 *   handler: () => oauthPublicKeysService.getJwks(),
 *   responseFormat: "items",
 * }));
 * ```
 *
 * For routes that must control the response directly (e.g., redirects,
 * custom headers), set `responseFormat: "raw"` and write to `res`
 * inside the handler.
 */
export function createGenericRouter<TBody = unknown, TResult = unknown>(
  options: GenericRouterOptions<TBody, TResult>,
): Router {
  const {
    method,
    path,
    handler,
    requestSchema,
    responseFormat = 'item',
    middleware = [],
  } = options;

  const successStatus =
    options.statusCode ?? (method === 'post' && responseFormat === 'item' ? 201 : 200);

  const router = Router();

  router[method](path, ...middleware, async (req: Request, res: Response, next) => {
    try {
      if (requestSchema) {
        req.body = requestSchema.parse(req.body);
      }

      const result = await handler(req, res);

      if (responseFormat === 'raw') {
        return;
      }

      if (responseFormat === 'items') {
        sendItems(res, result as unknown as unknown[], successStatus);
        return;
      }

      sendItem(res, result, successStatus);
    } catch (err) {
      if (handleZodError(err, res)) return;
      if (handleBusinessError(err, res)) return;
      next(err);
    }
  });

  return router;
}
