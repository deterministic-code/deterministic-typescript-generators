import { describe, it, expect } from 'vitest';
import { HANDLER_NAMES } from '../handlerNames';
import { ErrorHandlerMiddlewareService } from '../ErrorHandlerMiddlewareService';
import { NotFoundMiddlewareService } from '../NotFoundMiddlewareService';

describe('HANDLER_NAMES', () => {
  it('lists the canonical handler service classes exposed by the middleware barrel', () => {
    expect([...HANDLER_NAMES]).toEqual([
      'ErrorHandlerMiddlewareService',
      'NotFoundMiddlewareService',
    ]);
  });

  it('each name matches the actual exported class name', () => {
    const exportedClasses = {
      ErrorHandlerMiddlewareService,
      NotFoundMiddlewareService,
    } as const;
    for (const name of HANDLER_NAMES) {
      expect(exportedClasses[name].name).toBe(name);
    }
  });
});
