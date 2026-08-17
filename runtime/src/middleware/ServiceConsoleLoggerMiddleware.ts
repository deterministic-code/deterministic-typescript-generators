import type { IServiceMiddleware } from './IServiceMiddleware';
import { errorMessage, formatElapsedMs, formatTraceLine } from './traceFormat';

export class ServiceConsoleLoggerMiddleware implements IServiceMiddleware {
  beforeCall(serviceName: string, methodName: string, _args: ReadonlyArray<unknown>): void {
    console.log(
      formatTraceLine(new Date().toISOString(), 'service', 'Start', `${serviceName}.${methodName}`),
    );
  }

  afterCall(
    serviceName: string,
    methodName: string,
    _args: ReadonlyArray<unknown>,
    _result: unknown,
    elapsedMs: number,
    error?: unknown,
  ): void {
    const elapsed = formatElapsedMs(elapsedMs);
    if (error !== undefined) {
      console.log(
        formatTraceLine(
          new Date().toISOString(),
          'service',
          'Error',
          `${serviceName}.${methodName}`,
          `${errorMessage(error)} ${elapsed}`,
        ),
      );
      return;
    }
    console.log(
      formatTraceLine(
        new Date().toISOString(),
        'service',
        'Finish',
        `${serviceName}.${methodName}`,
        elapsed,
      ),
    );
  }
}
