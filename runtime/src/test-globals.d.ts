import type { vi } from 'vitest';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Mocked<T> = {
      [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] & import('vitest').Mock : T[K];
    } & T;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type MockedFunction<T extends (...args: any[]) => any> = T & import('vitest').Mock;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Mock<TArgs extends any[] = any[], TReturn = any> = import('vitest').Mock<TArgs, TReturn>;
  }

  // eslint-disable-next-line no-var
  var jest: typeof vi;
}

export {};
