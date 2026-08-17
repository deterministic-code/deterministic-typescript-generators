export type TraceTier = 'route' | 'service' | 'datasource';
export type TracePhase = 'Start' | 'Finish' | 'Error';

export function formatTraceLine(
  isoDateTime: string,
  tier: TraceTier,
  phase: TracePhase,
  method: string,
  suffix?: string,
): string {
  const head = `[${isoDateTime}]-[${tier}][${phase}]-[${method}]`;
  return suffix ? `${head} ${suffix}` : head;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function formatElapsedMs(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return '0ns';
  if (elapsedMs >= 1) return `${Math.round(elapsedMs)}ms`;
  if (elapsedMs >= 0.001) return `${Math.round(elapsedMs * 1000)}μs`;
  return `${Math.round(elapsedMs * 1_000_000)}ns`;
}
