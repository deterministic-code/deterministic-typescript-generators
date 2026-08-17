export const HANDLER_NAMES = [
  'ErrorHandlerMiddlewareService',
  'NotFoundMiddlewareService',
] as const;

export type HandlerName = (typeof HANDLER_NAMES)[number];
