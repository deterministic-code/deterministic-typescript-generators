import { vi } from 'vitest';

// Vitest-as-Jest compat shim. Existing tests were authored against Jest's
// `jest.fn()` / `jest.spyOn()` / `jest.Mocked<>` surface. Aliasing vi to jest
// keeps the tests working under Vitest without rewriting every spec.
(globalThis as Record<string, unknown>).jest = vi;
