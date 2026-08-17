import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { errorMessage, formatElapsedMs, formatTraceLine } from './traceFormat';

const STATE = Symbol('traceRouteMiddleware.state');

interface TraceState {
  start: number;
  terminal: boolean;
}

function methodLabel(req: Request): string {
  return `${req.method} ${req.originalUrl || req.url}`;
}

function emit(state: TraceState, req: Request, phase: 'Finish' | 'Error', suffix: string): void {
  if (state.terminal) return;
  state.terminal = true;
  console.log(formatTraceLine(new Date().toISOString(), 'route', phase, methodLabel(req), suffix));
}

/** Route-tier trace middleware: emits the one-line Start/Finish trace per request. */
export const traceRouteMiddleware: RequestHandler = (req, res, next) => {
  const state: TraceState = { start: performance.now(), terminal: false };
  (req as Request & { [STATE]?: TraceState })[STATE] = state;

  console.log(formatTraceLine(new Date().toISOString(), 'route', 'Start', methodLabel(req)));

  res.once('finish', () => {
    const elapsed = formatElapsedMs(performance.now() - state.start);
    emit(state, req, 'Finish', `${res.statusCode} ${elapsed}`);
  });
  res.once('close', () => {
    if (res.writableEnded) return;
    const elapsed = formatElapsedMs(performance.now() - state.start);
    emit(state, req, 'Error', `aborted ${elapsed}`);
  });

  next();
};

export const traceRouteErrorMiddleware: ErrorRequestHandler = (err, req, _res, next) => {
  const state = (req as Request & { [STATE]?: TraceState })[STATE];
  if (state) {
    const elapsed = formatElapsedMs(performance.now() - state.start);
    emit(state, req, 'Error', `${errorMessage(err)} ${elapsed}`);
  }
  next(err);
};
