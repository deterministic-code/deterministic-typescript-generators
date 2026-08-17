import { toCase } from "@deterministic-code/generator-sdk/case";
import { datasourceTestsModule } from "@deterministic-code/generator-sdk/codegen/lib/emit-settings-options";
import { layoutFor, namesFor, } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { buildDatasourceFixture, enumerateInvalidMutations, } from "@deterministic-code/generator-sdk/codegen/lib/fixture-builder";
import { serializeSampleValue as serializeValue } from "@deterministic-code/generator-sdk/codegen/lib/ts-sample-literal";
import { renderFieldAccessorCases } from "./ts-accessor-cases.js";
import { cloneFixture, renderMutationCase, renderNullableVariantCase, renderValidCase, } from "./zod-test-cases.js";
export const DEFAULT_EMIT_OPTIONS = {
    schemaVersion: "1.0",
    validatorPath: "../validators",
    typePath: "..",
};
function fileBase(name, opts) {
    return namesFor(opts).fileBase(name, "datasource-type");
}
function schemaIdent(name) {
    return `${toCase(name, "Camel")}Schema`; // lint-emitter-casing-allow: toCase
}
function joinImport(base, file) {
    const normalized = base.endsWith("/") ? base : `${base}/`;
    return `${normalized}${file}`;
}
function importsBlock(tableName, opts) {
    const schemaName = schemaIdent(tableName);
    const className = namesFor(opts).className(tableName);
    const file = fileBase(tableName, opts);
    const layout = layoutFor(opts);
    const schemaImport = layout.testImportSpecifier({ entity: tableName, artifact: "datasource-type" }, { entity: tableName, artifact: "datasource-validator" }, { flat: joinImport(opts.validatorPath, file) });
    const typeImport = layout.testImportSpecifier({ entity: tableName, artifact: "datasource-type" }, { entity: tableName, artifact: "datasource-type" }, { flat: joinImport(opts.typePath, file) });
    return [
        `import { describe, it, expect } from "vitest";`,
        `import type { ${className} } from "${typeImport}";`,
        `import { ${schemaName} } from "${schemaImport}";`,
    ].join("\n");
}
function hasAnyNullable(tableDef) {
    return (tableDef.fields ?? []).some((f) => {
        const fdef = Object.values(f)[0];
        return fdef.is_nullable === true;
    });
}
function nullableFieldNames(tableDef) {
    const names = new Set();
    for (const f of tableDef.fields ?? []) {
        const [fname, fdef] = Object.entries(f)[0];
        if (fdef.is_nullable === true)
            names.add(fname);
    }
    return names;
}
function renderAccessorCases(args) {
    const { tableName, tableDef, datasource, opts } = args;
    const className = namesFor(opts).className(tableName);
    const fixture = buildDatasourceFixture({
        table: tableName,
        datasource,
        datetime: opts.datetime,
        idType: opts.idType,
    });
    const entries = Object.entries(fixture);
    if (entries.length === 0)
        return { className, cases: [] };
    const serializedFixture = serializeValue(fixture);
    const cases = renderFieldAccessorCases({
        className,
        serializedFixture,
        entries,
        nullableNames: nullableFieldNames(tableDef),
    });
    return { className, cases };
}
export function emitForTable(entry, datasource, options = DEFAULT_EMIT_OPTIONS) {
    const opts = { ...DEFAULT_EMIT_OPTIONS, ...options };
    const [tableName, tableDef] = Object.entries(entry)[0];
    const schemaName = schemaIdent(tableName);
    const path = layoutFor(opts).testPath(tableName, "datasource-type", {
        fileName: `${fileBase(tableName, opts)}.test.ts`,
    });
    const validFixture = buildDatasourceFixture({
        table: tableName,
        datasource,
        datetime: opts.datetime,
        idType: opts.idType,
    });
    const cases = [renderValidCase(schemaName, validFixture)];
    if (hasAnyNullable(tableDef)) {
        const nullableFixture = buildDatasourceFixture({
            table: tableName,
            datasource,
            nullableVariant: true,
            datetime: opts.datetime,
            idType: opts.idType,
        });
        cases.push(renderNullableVariantCase(schemaName, nullableFixture));
    }
    const mutations = enumerateInvalidMutations({
        table: tableName,
        datasource,
    });
    for (const m of mutations) {
        const mutated = m.mutate(cloneFixture(validFixture));
        cases.push(renderMutationCase(schemaName, m.description, mutated));
    }
    const header = `// schema-version: ${opts.schemaVersion}\n${importsBlock(tableName, opts)}\n\n`;
    const validatorBody = `describe("${schemaName} (datasource_types.${tableName})", () => {\n${cases.join("\n\n")}\n});\n`;
    const accessor = renderAccessorCases({
        tableName,
        tableDef,
        datasource,
        opts,
    });
    let accessorBody = "";
    if (accessor.cases.length > 0) {
        accessorBody = `\ndescribe("${accessor.className} field accessors (datasource_types.${tableName})", () => {\n${accessor.cases.join("\n\n")}\n});\n`;
    }
    return {
        path,
        content: `${header}${validatorBody}${accessorBody}`,
    };
}
export const { emitFromSchema, createEmitter } = datasourceTestsModule({
    emitForTable,
    defaultEmitOptions: DEFAULT_EMIT_OPTIONS,
});
