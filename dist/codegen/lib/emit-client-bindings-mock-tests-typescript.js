import { clientBindingTestEntries } from "./frontend-bindings-routes.js";
import { BODY_METHODS, cap, fnNameOf, pathParamsOf, } from "./client-op-model.js";
import { sampleForSchema } from "./component-fixture.js";
import { serializeSampleValue as serializeValue } from "@deterministic-code/generator-sdk/codegen/lib/ts-sample-literal";
import { CONTENT } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
import { frontendTestHarnessPatch } from "./frontend-test-harness.js";
const CLIENT_LIBS = ["fetch", "axios", "tanstack"];
const PARAM_ARG = "1";
/** Native Date on both sides: the emitted client coerces datetime fields (z.coerce.date()) on request AND response, and axios's deep toHaveBeenCalledWith compares the coerced Date objects (fetch/tanstack compare JSON.stringify, which a native Date also satisfies). */
const FIXTURE_OPTS = { datetime: "native" };
function urlWithArgs(path) {
    return path.replace(/\{[^}]+\}/g, PARAM_ARG);
}
function opModel(row, components) {
    const method = row.method;
    const hasBody = BODY_METHODS.has(method) && Boolean(row.request);
    const params = pathParamsOf(row.path);
    const fnName = fnNameOf(row);
    return {
        fnName,
        hookName: `use${cap(fnName)}`,
        method,
        verb: method.toLowerCase(),
        url: urlWithArgs(row.path),
        paramArgs: params.map(() => PARAM_ARG),
        hasBody,
        bodyLit: hasBody
            ? serializeValue(sampleForSchema(row.request, components, FIXTURE_OPTS))
            : null,
        respLit: row.response
            ? serializeValue(sampleForSchema(row.response, components, FIXTURE_OPTS))
            : null,
        isVoid: !row.response,
    };
}
/** Bind each test's request/response fixtures to a single `const` so their runtime `crypto.randomUUID()`/`new Date()` calls evaluate once — the same value then flows to both the mocked transport and the assertion, keeping them in lockstep. */
function fixtureConsts(op) {
    const lines = [];
    if (op.hasBody)
        lines.push(`    const reqFixture = ${op.bodyLit};`);
    if (!op.isVoid)
        lines.push(`    const respFixture = ${op.respLit};`);
    return lines;
}
function callArgs(op, bodyExpr) {
    const args = [...op.paramArgs];
    if (op.hasBody && bodyExpr != null)
        args.push(bodyExpr);
    return args.join(", ");
}
function resultAssertion(op, expr) {
    return op.isVoid ? [] : [`    expect(${expr}).toEqual(respFixture);`];
}
function mockResponseBody(op) {
    return op.isVoid ? "{}" : "respFixture";
}
const FETCH_PRELUDE = [
    `import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";`,
];
const GLOBAL_FETCH_HELPERS = `beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function mockFetch(body: unknown) {
  const fn = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ ok: true, json: async () => body }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}`;
function fetchOpCase(op) {
    const bodyAssert = op.hasBody
        ? [`    expect(init?.body).toBe(JSON.stringify(reqFixture));`]
        : [];
    return [
        `  it("${op.fnName} issues ${op.method} ${op.url}", async () => {`,
        ...fixtureConsts(op),
        `    const fetchMock = mockFetch(${mockResponseBody(op)});`,
        `    const result = await ${op.fnName}(${callArgs(op, "reqFixture")});`,
        `    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];`,
        `    expect(url).toBe("${op.url}");`,
        `    expect(init?.method ?? "GET").toBe("${op.method}");`,
        ...bodyAssert,
        ...resultAssertion(op, "result"),
        `  });`,
    ].join("\n");
}
function errorCase(op) {
    const args = [
        op.hasBody ? `    const reqFixture = ${op.bodyLit};` : null,
    ].filter(Boolean);
    return [
        `  it("${op.fnName} throws on a non-ok response", async () => {`,
        ...args,
        `    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));`,
        `    await expect(${op.fnName}(${callArgs(op, "reqFixture")})).rejects.toThrow();`,
        `  });`,
    ].join("\n");
}
function vitestClientHead(symbols, clientImport) {
    return [
        ...FETCH_PRELUDE,
        `import { ${symbols} } from "${clientImport}";`,
    ].join("\n");
}
function fetchFile(ops, { entity, symbols, clientImport }) {
    const head = vitestClientHead(symbols, clientImport);
    const cases = ops.map(fetchOpCase);
    cases.push(errorCase(ops[0]));
    return `${head}\n\n${GLOBAL_FETCH_HELPERS}\n\ndescribe("${entity} fetch client", () => {\n${cases.join("\n\n")}\n});\n`;
}
const AXIOS_MOCK = `vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));`;
function axiosOpCase(op) {
    const calledWith = op.hasBody ? `"${op.url}", reqFixture` : `"${op.url}"`;
    return [
        `  it("${op.fnName} issues ${op.method} ${op.url}", async () => {`,
        ...fixtureConsts(op),
        `    vi.mocked(axios.${op.verb}).mockResolvedValue({ data: ${mockResponseBody(op)} } as never);`,
        `    const result = await ${op.fnName}(${callArgs(op, "reqFixture")});`,
        `    expect(axios.${op.verb}).toHaveBeenCalledWith(${calledWith});`,
        ...resultAssertion(op, "result"),
        `  });`,
    ].join("\n");
}
function axiosErrorCase(op) {
    const decl = op.hasBody ? [`    const reqFixture = ${op.bodyLit};`] : [];
    return [
        `  it("${op.fnName} rejects when axios errors", async () => {`,
        ...decl,
        `    vi.mocked(axios.${op.verb}).mockRejectedValue(new Error("boom"));`,
        `    await expect(${op.fnName}(${callArgs(op, "reqFixture")})).rejects.toThrow();`,
        `  });`,
    ].join("\n");
}
function axiosFile(ops, { entity, symbols, clientImport }) {
    const head = [
        `import { describe, it, expect, vi, beforeEach } from "vitest";`,
        `import axios from "axios";`,
        `import { ${symbols} } from "${clientImport}";`,
    ].join("\n");
    const cases = ops.map(axiosOpCase);
    cases.push(axiosErrorCase(ops[0]));
    return `${head}\n\n${AXIOS_MOCK}\n\nbeforeEach(() => vi.clearAllMocks());\n\ndescribe("${entity} axios client", () => {\n${cases.join("\n\n")}\n});\n`;
}
const TANSTACK_MOCK = `vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
}));`;
function tanstackQueryCase(op) {
    return [
        `  it("${op.hookName} queries ${op.url}", async () => {`,
        ...fixtureConsts(op),
        `    const fetchMock = mockFetch(${mockResponseBody(op)});`,
        `    const query = ${op.hookName}(${op.paramArgs.join(", ")}) as unknown as { queryFn: () => Promise<unknown> };`,
        `    const result = await query.queryFn();`,
        `    expect(fetchMock.mock.calls[0][0]).toBe("${op.url}");`,
        ...resultAssertion(op, "result"),
        `  });`,
    ].join("\n");
}
function tanstackMutationCase(op) {
    const bodyAssert = op.hasBody
        ? [`    expect(init?.body).toBe(JSON.stringify(reqFixture));`]
        : [];
    const mutArg = op.hasBody ? "reqFixture" : "";
    return [
        `  it("${op.hookName} sends ${op.method} ${op.url}", async () => {`,
        ...fixtureConsts(op),
        `    const fetchMock = mockFetch(${mockResponseBody(op)});`,
        `    const mutation = ${op.hookName}(${op.paramArgs.join(", ")}) as unknown as { mutationFn: (body?: unknown) => Promise<unknown> };`,
        `    const result = await mutation.mutationFn(${mutArg});`,
        `    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];`,
        `    expect(url).toBe("${op.url}");`,
        `    expect(init?.method).toBe("${op.method}");`,
        ...bodyAssert,
        ...resultAssertion(op, "result"),
        `  });`,
    ].join("\n");
}
function tanstackCase(op) {
    return op.method === "GET" ? tanstackQueryCase(op) : tanstackMutationCase(op);
}
function tanstackFile(ops, { entity, symbols, clientImport }) {
    const head = vitestClientHead(symbols, clientImport);
    const cases = ops.map(tanstackCase);
    return `${head}\n\n${TANSTACK_MOCK}\n\n${GLOBAL_FETCH_HELPERS}\n\ndescribe("${entity} tanstack client", () => {\n${cases.join("\n\n")}\n});\n`;
}
function importedSymbols(ops, client) {
    const key = client === "tanstack" ? "hookName" : "fnName";
    return [...new Set(ops.map((op) => op[key]))].sort().join(", ");
}
const FILE_RENDERERS = {
    fetch: fetchFile,
    axios: axiosFile,
    tanstack: tanstackFile,
};
function entityClientEntries({ ds, entity, entityRows, components }, clients, layout) {
    const ops = entityRows.map((row) => opModel(row, components));
    return clients.map((client) => {
        const testFile = layout.frontendClientFile(ds.name, entity, `${client}.test.ts`);
        const clientFile = layout.frontendClientFile(ds.name, entity, `${client}.ts`);
        return {
            kind: CONTENT,
            filename: testFile,
            contents: FILE_RENDERERS[client](ops, {
                entity,
                symbols: importedSymbols(ops, client),
                clientImport: layout.frontendRelImport(testFile, clientFile),
            }),
        };
    });
}
/** Emit a `<client>.test.ts` next to every emitted client file, one per (object, library). Each drives the real client function against a mocked transport — fetch/tanstack stub `globalThis.fetch`, axios mocks the module — and asserts the exact method + URL (params substituted) + JSON body the client sends, that the response is returned, and that a non-ok/error transport rejects. Driven by the same route projection as client_bindings, so the tests track the emitted clients one-to-one. Adds the vitest harness to frontend/package.json. */
export function emit({ inputs, settings, }) {
    return clientBindingTestEntries({
        inputs,
        settings,
        clientLibs: CLIENT_LIBS,
        entryFor: entityClientEntries,
        harness: () => [frontendTestHarnessPatch()],
    });
}
export const entriesNative = true;
export const assembleAfterStep = true;
