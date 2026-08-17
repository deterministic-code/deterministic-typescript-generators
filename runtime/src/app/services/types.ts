export type ArgSpec =
  | { kind: 'repo'; name: string }
  | { kind: 'service'; name: string }
  | { kind: 'config'; key: string }
  | { kind: 'undefined' }
  | { kind: 'literal'; value: unknown };

export interface ServiceSpec {
  name: string;
  args: ArgSpec[];
  type?: string;
  module?: string;
}

export type ServiceConstructor = new (...args: unknown[]) => unknown;
