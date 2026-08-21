import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type FetchHttp = {
  request: <T>(input: {
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  }) => Promise<T>;
};

export type BindingClient = Record<
  string,
  (...args: unknown[]) => Promise<unknown>
>;

const camelIdent = (name: string): string => {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  return words
    .map((word, i) =>
      i === 0 ? word : `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`,
    )
    .join("");
};

export const asRecord = (value: unknown): Record<string, unknown> => {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
};

export const itemsOf = (body: unknown): unknown[] => {
  if (Array.isArray(body)) return body;
  const rec = asRecord(body);
  assert.ok(Array.isArray(rec.items), "expected { items: [] }");
  return rec.items;
};

export const loadFetchClient = async (
  appDir: string,
  fileBase: string,
  baseUrl: string,
): Promise<{ http: FetchHttp; client: BindingClient }> => {
  const dir = join(appDir, "frontend/src/client/fetch");
  const httpMod = (await import(pathToFileURL(join(dir, "http.ts")).href)) as {
    createHttp: (baseUrl: string) => FetchHttp;
  };
  const entityMod = (await import(
    pathToFileURL(join(dir, `${fileBase}.ts`)).href
  )) as Record<string, (http: FetchHttp) => BindingClient>;
  const factory = entityMod[`${camelIdent(fileBase)}Client`];
  assert.equal(typeof factory, "function", `missing ${fileBase}Client`);
  const http = httpMod.createHttp(baseUrl);
  return { http, client: factory(http) };
};

export const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
