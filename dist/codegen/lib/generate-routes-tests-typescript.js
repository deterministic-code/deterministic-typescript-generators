import { generateRoutesTestsFiles, dispatchRoutesTestsStep, routesStepGenerate, } from "@deterministic-code/generator-sdk/codegen/lib/routes-generate";
import { camelPlural } from "@deterministic-code/generator-sdk/case";
import { namesFor, layoutFor, } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { collectCombinedRouteDescriptors } from "@deterministic-code/generator-sdk/codegen/lib/iterate-combined-routes";
import { entityUsesOptimisticConcurrency } from "@deterministic-code/generator-sdk/lib/generate-sql";
import { generateNestedDirectFkRouterTest, generateNestedM2mRouterTest, } from "./generate-nested-routes-tests-typescript.js";
import { candidateIdExprs } from "./route-test-sample-id.js";
import { libraryImportSpecifier } from "./library-import.js";
/** The `import { PrimaryKey }` line + the `new PrimaryKey(col, idType)` expression a router test uses to build its mock service's key, so the router derives route id-parsing from `service.primaryKey` exactly as production does. */
function primaryKeyMock(candidate, opts, testPath) {
    const { idFieldName, idType } = candidateIdExprs(candidate);
    const repositoriesImport = libraryImportSpecifier("repositories", opts.libraryReferenceMode, testPath);
    return {
        importLine: `import { PrimaryKey } from "${repositoriesImport}";`,
        expr: `new PrimaryKey(${JSON.stringify(idFieldName)}, ${JSON.stringify(idType)})`,
    };
}
export const DEFAULT_GENERATE_OPTIONS = {
    schemaVersion: "1.0",
    apiBase: "/api",
    fileFormat: "Camel",
};
const MOCK_FACTORY = `function createMock(primaryKey?: any): any {
  return {
    primaryKey,
    query: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findBy: vi.fn().mockResolvedValue([]),
    create: vi.fn(async (data: unknown) => ({ id: 1, ...(data as object) })),
    update: vi.fn(async (id: number, data: unknown) => ({ id, ...(data as object) })),
    patch: vi.fn(async (id: number, data: unknown) => ({ id, ...(data as object) })),
    delete: vi.fn().mockResolvedValue(true),
    updateBy: vi.fn().mockResolvedValue(0),
    deleteBy: vi.fn().mockResolvedValue(0),
  };
}
`;
function fkMockSuffix(enrichments) {
    if (!enrichments || enrichments.length === 0)
        return "";
    return enrichments.map((e) => `, ${e.fkColumn}: 1`).join("");
}
function requestNameSuffix(enrichments) {
    if (!enrichments || enrichments.length === 0)
        return "";
    return enrichments
        .map((e) => `, ${e.newField}: "${e.targetTable}-1"`)
        .join("");
}
function snakeToKebabBy(name) {
    return name.replace(/_/g, "-");
}
function byFieldGetUnique({ mountPath, kebab, byField }) {
    return `
  it("GET ${mountPath}/${kebab}/:value returns the row when unique findBy matches", async () => {
    service.findBy.mockResolvedValueOnce([{ id: 1, ${byField}: "x" }]);
    const res = await request(app).get("${mountPath}/${kebab}/x");
    expect(res.status).toBe(200);
    expect(service.findBy).toHaveBeenCalledWith([{ name: "${byField}", value: "x" }]);
  });

  it("GET ${mountPath}/${kebab}/:value returns 404 when no row matches", async () => {
    service.findBy.mockResolvedValueOnce([]);
    const res = await request(app).get("${mountPath}/${kebab}/missing");
    expect(res.status).toBe(404);
  });

  it("GET ${mountPath}/${kebab}/:value returns 409 when multiple rows match a unique-byField route", async () => {
    service.findBy.mockResolvedValueOnce([
      { id: 1, ${byField}: "x" },
      { id: 2, ${byField}: "x" },
    ]);
    const res = await request(app).get("${mountPath}/${kebab}/x");
    expect(res.status).toBe(409);
  });`;
}
function byFieldGetNonUnique({ mountPath, kebab, byField, }) {
    return `
  it("GET ${mountPath}/${kebab}/:value returns the array of matches", async () => {
    service.findBy.mockResolvedValueOnce([
      { id: 1, ${byField}: "x" },
      { id: 2, ${byField}: "x" },
    ]);
    const res = await request(app).get("${mountPath}/${kebab}/x");
    expect(res.status).toBe(200);
    expect(service.findBy).toHaveBeenCalledWith([{ name: "${byField}", value: "x" }]);
  });`;
}
function byFieldPutUnique({ mountPath, kebab, byField, ifMatch, }) {
    return `
  it("PUT ${mountPath}/${kebab}/:value updates the unique row", async () => {
    service.updateBy.mockResolvedValueOnce(1);
    service.findBy.mockResolvedValueOnce([{ id: 1, ${byField}: "x" }]);
    const res = await request(app).put("${mountPath}/${kebab}/x")${ifMatch}.send({});
    expect(res.status).toBe(200);
    expect(service.updateBy).toHaveBeenCalledWith(
      [{ name: "${byField}", value: "x" }],
      {},
    );
  });

  it("PUT ${mountPath}/${kebab}/:value returns 404 when no row matches", async () => {
    service.updateBy.mockResolvedValueOnce(0);
    const res = await request(app).put("${mountPath}/${kebab}/missing")${ifMatch}.send({});
    expect(res.status).toBe(404);
  });`;
}
function byFieldPutNonUnique({ mountPath, kebab, ifMatch, }) {
    return `
  it("PUT ${mountPath}/${kebab}/:value returns { count } for the non-unique case", async () => {
    service.updateBy.mockResolvedValueOnce(3);
    const res = await request(app).put("${mountPath}/${kebab}/x")${ifMatch}.send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 3 });
  });`;
}
function byFieldDeleteUnique({ mountPath, kebab, byField, ifMatch, }) {
    return `
  it("DELETE ${mountPath}/${kebab}/:value returns success when one row deleted", async () => {
    service.deleteBy.mockResolvedValueOnce(1);
    const res = await request(app).delete("${mountPath}/${kebab}/x")${ifMatch};
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(service.deleteBy).toHaveBeenCalledWith([{ name: "${byField}", value: "x" }]);
  });

  it("DELETE ${mountPath}/${kebab}/:value returns 404 when no row matches", async () => {
    service.deleteBy.mockResolvedValueOnce(0);
    const res = await request(app).delete("${mountPath}/${kebab}/missing")${ifMatch};
    expect(res.status).toBe(404);
  });`;
}
function byFieldDeleteNonUnique({ mountPath, kebab, ifMatch, }) {
    return `
  it("DELETE ${mountPath}/${kebab}/:value returns { count } for the non-unique case", async () => {
    service.deleteBy.mockResolvedValueOnce(2);
    const res = await request(app).delete("${mountPath}/${kebab}/x")${ifMatch};
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 2 });
  });`;
}
function byFieldTestBlock(mountPath, entry, ifMatch = "") {
    const kebab = snakeToKebabBy(entry.byField);
    const methods = Array.isArray(entry.methods)
        ? entry.methods
        : ["GET", "PUT", "DELETE"];
    const unique = entry.byFieldUnique === true;
    const ctx = { mountPath, kebab, byField: entry.byField, ifMatch };
    const out = [];
    if (methods.includes("GET")) {
        out.push(unique ? byFieldGetUnique(ctx) : byFieldGetNonUnique(ctx));
    }
    if (methods.includes("PUT")) {
        out.push(unique ? byFieldPutUnique(ctx) : byFieldPutNonUnique(ctx));
    }
    if (methods.includes("DELETE")) {
        out.push(unique ? byFieldDeleteUnique(ctx) : byFieldDeleteNonUnique(ctx));
    }
    return out.join("\n");
}
function byFieldsTestBlock(mountPath, byFields, ifMatch = "") {
    if (!byFields || byFields.length === 0)
        return "";
    return byFields
        .map((entry) => byFieldTestBlock(mountPath, entry, ifMatch))
        .join("\n");
}
function routerTestNaming(candidate, opts) {
    const names = namesFor(opts);
    const apiBase = opts.apiBase ?? DEFAULT_GENERATE_OPTIONS.apiBase;
    return {
        entity: names.className(candidate.name),
        fnName: `${camelPlural(candidate.name)}Router`, // lint-generator-casing-allow: camelPlural
        fileBase: names.fileBasePlural(candidate.name),
        mountPath: `${apiBase}/${layoutFor(opts).apiPath(candidate.name)}`,
    };
}
function routerTestFixtures(candidate, opts, fileBase) {
    const enrichments = candidate.enrichments ?? [];
    const { idFieldName, idValueExpr, idPathExpr } = candidateIdExprs(candidate);
    const testPath = layoutFor(opts).testPath(candidate.name, "route", {
        fileName: `${fileBase}.integration.test.ts`,
    });
    return {
        enrichments,
        fkSuffix: fkMockSuffix(enrichments),
        idFieldName,
        idValueExpr,
        idPathExpr,
        testPath,
        pk: primaryKeyMock(candidate, opts, testPath),
    };
}
export function generateReadOnlyRouterTest(candidate, opts = DEFAULT_GENERATE_OPTIONS) {
    const { fnName, fileBase, mountPath } = routerTestNaming(candidate, opts);
    const { fkSuffix, idFieldName, idValueExpr, idPathExpr, testPath, pk } = routerTestFixtures(candidate, opts, fileBase);
    const content = `import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Application } from "express";
import request from "supertest";
${pk.importLine}
import { ${fnName} } from "../${fileBase}";

${MOCK_FACTORY}
describe("${fnName}", () => {
  let service: any;
  let app: Application;

  beforeEach(() => {
    service = createMock(${pk.expr});
    app = express();
    app.use(express.json());
    app.use("${mountPath}", ${fnName}(service));
  });

  it("GET ${mountPath} returns items from service.findAll", async () => {
    service.findAll.mockResolvedValueOnce([{ ${idFieldName}: ${idValueExpr(1)}${fkSuffix} }]);
    const res = await request(app).get("${mountPath}");
    expect(res.status).toBe(200);
    expect(service.findAll).toHaveBeenCalledOnce();
  });

  it("GET ${mountPath}/:${idFieldName} returns the entity from service.findById", async () => {
    service.findById.mockResolvedValueOnce({ ${idFieldName}: ${idValueExpr(7)}${fkSuffix} });
    const res = await request(app).get("${mountPath}/${idPathExpr(7)}");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ${idFieldName}: ${idValueExpr(7)} });
    expect(service.findById).toHaveBeenCalledWith(${idValueExpr(7)});
  });

  it("GET ${mountPath}/:${idFieldName} returns 404 when service.findById yields null", async () => {
    service.findById.mockResolvedValueOnce(null);
    const res = await request(app).get("${mountPath}/${idPathExpr(999)}");
    expect(res.status).toBe(404);
  });
${byFieldsTestBlock(mountPath, candidate.byFields)}
});
`;
    return { path: testPath, content };
}
/** When OCC is enabled the routes require an If-Match header on mutating verbs (else 428) and forward `expectedUpdated` into the service mock as a third arg, so the asserted `toHaveBeenCalledWith` must include the OCC opts object; one describe-scope `occToken` feeds both the sent header and the asserted arg so the runtime timestamp matches on both sides. */
function occExpressions(candidate, opts) {
    const on = entityUsesOptimisticConcurrency(candidate, opts.useOptimisticConcurrency === true);
    return {
        ifMatch: on ? `.set("If-Match", occToken)` : "",
        occCallArg: on ? `, { expectedUpdated: occToken }` : "",
        occDecl: on ? `  const occToken = new Date().toISOString();\n` : "",
    };
}
export function generateCrudRouterTest(candidate, opts = DEFAULT_GENERATE_OPTIONS) {
    const { entity, fnName, fileBase, mountPath } = routerTestNaming(candidate, opts);
    const { enrichments, fkSuffix, idFieldName, idValueExpr, idPathExpr, testPath, pk, } = routerTestFixtures(candidate, opts, fileBase);
    const nameSuffix = requestNameSuffix(enrichments);
    const { ifMatch, occCallArg, occDecl } = occExpressions(candidate, opts);
    const content = `import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Application } from "express";
import request from "supertest";
${pk.importLine}
import { ${fnName} } from "../${fileBase}";

${MOCK_FACTORY}
// The router validates each body through the schemas the composer passes in; a passthrough stands in for them so these tests exercise routing/delegation, not schema shape.
const passthrough = { parse: (value: unknown) => value } as any;

describe("${fnName}", () => {
  let service: any;
${occDecl}  let app: Application;

  beforeEach(() => {
    service = createMock(${pk.expr});
    app = express();
    app.use(express.json());
    app.use("${mountPath}", ${fnName}(service, passthrough, passthrough));
  });

  it("GET ${mountPath} delegates to service.findAll", async () => {
    await request(app).get("${mountPath}");
    expect(service.findAll).toHaveBeenCalledOnce();
  });

  it("GET ${mountPath}/:${idFieldName} delegates to service.findById", async () => {
    service.findById.mockResolvedValueOnce({ ${idFieldName}: ${idValueExpr(3)}${fkSuffix} });
    const res = await request(app).get("${mountPath}/${idPathExpr(3)}");
    expect(res.status).toBe(200);
    expect(service.findById).toHaveBeenCalledWith(${idValueExpr(3)});
  });

  it("POST ${mountPath} delegates to service.create", async () => {
    const payload = { name: "${entity}-new"${nameSuffix} };
    service.create.mockResolvedValueOnce({ ${idFieldName}: ${idValueExpr(11)}${fkSuffix} });
    const res = await request(app).post("${mountPath}").send(payload);
    expect(res.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith({ name: "${entity}-new"${nameSuffix} });
  });

  it("PUT ${mountPath}/:${idFieldName} delegates to service.update", async () => {
    const payload = { name: "${entity}-updated"${nameSuffix} };
    service.update.mockResolvedValueOnce({ ${idFieldName}: ${idValueExpr(4)}${fkSuffix} });
    await request(app).put("${mountPath}/${idPathExpr(4)}")${ifMatch}.send(payload);
    expect(service.update).toHaveBeenCalledWith(${idValueExpr(4)}, { name: "${entity}-updated"${nameSuffix} }${occCallArg});
  });

  it("PATCH ${mountPath}/:${idFieldName} delegates to service.patch", async () => {
    const payload = { name: "${entity}-patched"${nameSuffix} };
    service.patch.mockResolvedValueOnce({ ${idFieldName}: ${idValueExpr(5)}${fkSuffix} });
    await request(app).patch("${mountPath}/${idPathExpr(5)}")${ifMatch}.send(payload);
    expect(service.patch).toHaveBeenCalledWith(${idValueExpr(5)}, { name: "${entity}-patched"${nameSuffix} }${occCallArg});
  });

  it("DELETE ${mountPath}/:${idFieldName} delegates to service.delete", async () => {
    service.delete.mockResolvedValueOnce(true);
    const res = await request(app).delete("${mountPath}/${idPathExpr(6)}")${ifMatch};
    expect(res.status).toBe(200);
    expect(service.delete).toHaveBeenCalledWith(${idValueExpr(6)}${occCallArg});
  });
${byFieldsTestBlock(mountPath, candidate.byFields, ifMatch)}
});
`;
    return { path: testPath, content };
}
export function generateCombinedRouteTests({ routesData, datasourceData, }, generateOptions) {
    const files = [];
    const descriptors = collectCombinedRouteDescriptors({
        routesData,
        datasourceData,
    });
    for (const d of descriptors) {
        if (d.kind === "direct-fk") {
            files.push(generateNestedDirectFkRouterTest(d, generateOptions));
        }
        else if (d.kind === "m2m") {
            files.push(generateNestedM2mRouterTest(d, generateOptions));
        }
    }
    return files;
}
/** Catalog `routes_tests` step (typescript). */
export const generate = (ctx) => routesStepGenerate({
    dispatchStep: dispatchRoutesTestsStep,
    generator: { createGenerator },
    language: "typescript",
}, ctx);
export const createGenerator = () => ({
    generate: (config) => generateRoutesTestsFiles({
        ...config,
        primitives: {
            generateReadOnlyRouterTest,
            generateCrudRouterTest,
            generateCombinedRouteTests,
            defaultGenerateOptions: DEFAULT_GENERATE_OPTIONS,
        },
    }),
});
