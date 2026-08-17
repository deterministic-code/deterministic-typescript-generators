import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { traceRouteErrorMiddleware, traceRouteMiddleware } from '../traceRouteMiddleware';

const TRACE_PATTERN = /^\[[^\]]+\]-\[route\]\[(Start|Finish|Error)\]-\[([^\]]+)\](?:\s+(.*))?$/;

interface Captured {
  phase: 'Start' | 'Finish' | 'Error';
  method: string;
  suffix?: string;
}

function capture(logSpy: ReturnType<typeof vi.spyOn>): Captured[] {
  return logSpy.mock.calls
    .map((args) => String(args[0]))
    .map((line) => TRACE_PATTERN.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      phase: m[1] as Captured['phase'],
      method: m[2],
      suffix: m[3],
    }));
}

describe('traceRouteMiddleware', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('emits Start then Finish for a successful request, with status and elapsed', async () => {
    const app = express();
    app.use(traceRouteMiddleware);
    app.get('/api/users/:id', (req, res) => {
      res.status(200).json({ id: req.params.id });
    });

    await request(app).get('/api/users/42').expect(200);

    const traced = capture(logSpy);
    expect(traced).toHaveLength(2);
    expect(traced[0]).toMatchObject({ phase: 'Start', method: 'GET /api/users/42' });
    expect(traced[1].phase).toBe('Finish');
    expect(traced[1].method).toBe('GET /api/users/42');
    expect(traced[1].suffix).toMatch(/^200 \d+(?:ms|μs|ns)$/);
  });

  it('emits Error when next(err) is called', async () => {
    const app = express();
    app.use(traceRouteMiddleware);
    app.get('/boom', (_req, _res, next) => {
      next(new Error('detonated'));
    });
    app.use(traceRouteErrorMiddleware);
    const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
      res.status(500).json({ error: (err as Error).message });
    };
    app.use(errorHandler);

    await request(app).get('/boom').expect(500);

    const traced = capture(logSpy);
    const phases = traced.map((t) => t.phase);
    expect(phases).toContain('Start');
    expect(phases).toContain('Error');
    expect(phases).not.toContain('Finish');
    const err = traced.find((t) => t.phase === 'Error');
    expect(err?.method).toBe('GET /boom');
    expect(err?.suffix).toMatch(/detonated.*\d+(?:ms|μs|ns)/);
  });

  it('does not emit duplicate terminal lines when both close and finish fire', async () => {
    const app = express();
    app.use(traceRouteMiddleware);
    app.get('/ok', (_req, res) => {
      res.json({ ok: true });
    });

    await request(app).get('/ok').expect(200);

    const terminals = capture(logSpy).filter((t) => t.phase === 'Finish' || t.phase === 'Error');
    expect(terminals).toHaveLength(1);
  });

  it('uses req.path when there is no matching route', async () => {
    const app = express();
    app.use(traceRouteMiddleware);
    app.use((_req, res) => res.status(404).end());

    await request(app).get('/no-such-thing').expect(404);

    const traced = capture(logSpy);
    expect(traced[0].method).toBe('GET /no-such-thing');
  });
});
