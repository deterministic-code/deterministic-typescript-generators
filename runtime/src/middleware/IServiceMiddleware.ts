export interface IServiceMiddleware {
  beforeCall(
    serviceName: string,
    methodName: string,
    args: ReadonlyArray<unknown>,
  ): void | Promise<void>;

  afterCall(
    serviceName: string,
    methodName: string,
    args: ReadonlyArray<unknown>,
    result: unknown,
    elapsedMs: number,
    error?: unknown,
  ): void | Promise<void>;
}
