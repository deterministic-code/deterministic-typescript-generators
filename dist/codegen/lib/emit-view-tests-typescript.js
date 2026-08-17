import { toCase } from "@deterministic-code/generator-sdk/case";
import { testCasingOptionsFromSettings } from "@deterministic-code/generator-sdk/codegen/lib/emit-settings-options";
import { layoutFor, namesFor, } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { normalizeAll } from "@deterministic-code/generator-sdk/view-expand";
import { viewEmitter } from "@deterministic-code/generator-sdk/codegen-context";
import { TypescriptImports } from "./typescript-imports.js";
import { buildViewFixture, enumerateInvalidMutations, } from "@deterministic-code/generator-sdk/codegen/lib/fixture-builder";
import { serializeSampleValue as serializeValue } from "@deterministic-code/generator-sdk/codegen/lib/ts-sample-literal";
import { renderFieldAccessorCases } from "./ts-accessor-cases.js";
import { joinImport } from "./library-import.js";
export const DEFAULT_EMIT_OPTIONS = {
    schemaVersion: "1.0",
    viewPath: "..",
    schemaPath: "../validators",
};
function fileBase(name, opts) {
    return namesFor(opts).fileBase(name, "view-type");
}
function viewSchemaIdent(name) {
    return `${toCase(name, "Camel")}Schema`; // lint-emitter-casing-allow: toCase
}
function importsBlock(viewName, opts, { withTypeImport } = { withTypeImport: false }) {
    const schemaName = viewSchemaIdent(viewName);
    const file = fileBase(viewName, opts);
    const schemaImportPath = layoutFor(opts).testImportSpecifier({ entity: viewName, artifact: "view-type" }, { entity: viewName, artifact: "view-validator" }, {
        flat: joinImport(opts.schemaPath, file),
    });
    const lines = [`import { describe, it, expect } from "vitest";`];
    if (withTypeImport) {
        const className = namesFor(opts).className(viewName);
        const viewImportPath = layoutFor(opts).testImportSpecifier({ entity: viewName, artifact: "view-type" }, { entity: viewName, artifact: "view-type" }, {
            flat: joinImport(opts.viewPath, file),
        });
        lines.push(`import type { ${className} } from "${viewImportPath}";`);
    }
    lines.push(`import { ${schemaName} } from "${schemaImportPath}";`);
    return lines.join("\n");
}
function collectNullableFieldNames(view, datasource) {
    const names = new Set();
    for (const f of view.fields) {
        if (f.isNullable)
            names.add(f.name);
    }
    if (view.inherits) {
        const entry = (datasource.types ?? []).find((e) => Object.keys(e)[0] === view.inherits);
        if (entry) {
            const def = Object.values(entry)[0];
            for (const f of def.fields ?? []) {
                const [fname, fdef] = Object.entries(f)[0];
                if (fdef.is_nullable === true)
                    names.add(fname);
            }
        }
    }
    return names;
}
function renderAccessorCases({ view, viewTypes, datasource, opts, }) {
    const validFixture = buildViewFixture({
        view: view.name,
        viewTypes,
        datasource,
        datetime: opts.datetime,
        idType: opts.idType,
    });
    const className = namesFor(opts).className(view.name);
    const entries = Object.entries(validFixture);
    if (entries.length === 0)
        return { cases: [], className };
    const serializedFixture = serializeValue(validFixture);
    const cases = renderFieldAccessorCases({
        className,
        serializedFixture,
        entries,
        nullableNames: collectNullableFieldNames(view, datasource),
    });
    return { cases, className };
}
function escapeForTestName(s) {
    return s.replace(/"/g, '\\"');
}
/** Only deep-clone plain objects; RuntimeValue/RawTsExpr/Date markers are immutable and must keep their prototype so the serializer still recognizes them. */
function cloneDeep(value) {
    if (value instanceof Uint8Array)
        return new Uint8Array(value);
    if (Array.isArray(value))
        return value.map(cloneDeep);
    if (value !== null &&
        typeof value === "object" &&
        Object.getPrototypeOf(value) === Object.prototype) {
        const out = {};
        for (const [k, v] of Object.entries(value))
            out[k] = cloneDeep(v);
        return out;
    }
    return value;
}
function anyNullableOnInherited(tableName, datasource) {
    const entry = (datasource.types ?? []).find((e) => Object.keys(e)[0] === tableName);
    const def = Object.values(entry)[0];
    return (def.fields ?? []).some((f) => Object.values(f)[0].is_nullable === true);
}
function parseCase({ schemaName, name, value, assertion, }) {
    return [
        `  it("${name}", () => {`,
        `    const value = ${serializeValue(value)};`,
        `    expect(() => ${schemaName}.parse(value)).${assertion}();`,
        `  });`,
    ].join("\n");
}
function shapedValidatorCases({ view, viewTypes, datasource, opts, }) {
    const schemaName = viewSchemaIdent(view.name);
    const fixtureBase = {
        view: view.name,
        viewTypes,
        datasource,
        datetime: opts.datetime,
        idType: opts.idType,
    };
    const validFixture = buildViewFixture(fixtureBase);
    const cases = [
        parseCase({
            schemaName,
            name: "parses a valid payload",
            value: validFixture,
            assertion: "not.toThrow",
        }),
    ];
    const hasNullable = view.fields.some((f) => f.isNullable) ||
        Boolean(view.inherits && anyNullableOnInherited(view.inherits, datasource));
    if (hasNullable) {
        const nullableFixture = buildViewFixture({
            ...fixtureBase,
            nullableVariant: true,
        });
        cases.push(parseCase({
            schemaName,
            name: "accepts null for nullable fields",
            value: nullableFixture,
            assertion: "not.toThrow",
        }));
    }
    const mutations = enumerateInvalidMutations({
        view: view.name,
        viewTypes,
        datasource,
    });
    for (const m of mutations) {
        const mutated = m.mutate(cloneDeep(validFixture));
        cases.push(parseCase({
            schemaName,
            name: `rejects when ${escapeForTestName(m.description)}`,
            value: mutated,
            assertion: "toThrow",
        }));
    }
    return cases;
}
function renderShapedView(args) {
    const { view, opts } = args;
    const schemaName = viewSchemaIdent(view.name);
    const cases = shapedValidatorCases(args);
    const header = `// schema-version: ${opts.schemaVersion}\n${importsBlock(view.name, opts, { withTypeImport: true })}\n\n`;
    const validatorBody = `describe("${schemaName} (view_types.${view.name})", () => {\n${cases.join("\n\n")}\n});\n`;
    const accessor = renderAccessorCases(args);
    let accessorBody = "";
    if (accessor && accessor.cases.length > 0) {
        accessorBody = `\ndescribe("${accessor.className} field accessors (view_types.${view.name})", () => {\n${accessor.cases.join("\n\n")}\n});\n`;
    }
    return {
        path: `${fileBase(view.name, opts)}.test.ts`,
        content: `${header}${validatorBody}${accessorBody}`,
    };
}
function renderUnionView({ view, viewTypes, datasource, opts, }) {
    const schemaName = viewSchemaIdent(view.name);
    const cases = [];
    const members = buildViewFixture({
        view: view.name,
        viewTypes,
        datasource,
        allMembers: true,
        datetime: opts.datetime,
        idType: opts.idType,
    });
    for (const { memberName, fixture } of members) {
        cases.push([
            `  it("accepts a ${memberName} member", () => {`,
            `    const value = ${serializeValue(fixture)};`,
            `    expect(() => ${schemaName}.parse(value)).not.toThrow();`,
            `  });`,
        ].join("\n"));
    }
    cases.push([
        `  it("rejects a shape that matches neither member", () => {`,
        `    const value = { __not_a_member__: true };`,
        `    expect(() => ${schemaName}.parse(value)).toThrow();`,
        `  });`,
    ].join("\n"));
    const header = `// schema-version: ${opts.schemaVersion}\n${importsBlock(view.name, opts, { withTypeImport: false })}\n\n`;
    const body = `describe("${schemaName} (view_types.${view.name})", () => {\n${cases.join("\n\n")}\n});\n`;
    return {
        path: `${fileBase(view.name, opts)}.test.ts`,
        content: `${header}${body}`,
    };
}
export function emitForView({ view, viewTypes, datasource, options = DEFAULT_EMIT_OPTIONS, }) {
    const opts = { ...DEFAULT_EMIT_OPTIONS, ...options };
    if (view.kind === "union") {
        return renderUnionView({ view, viewTypes, datasource, opts });
    }
    return renderShapedView({ view, viewTypes, datasource, opts });
}
export function emitFromSchema({ viewTypes, datasource }, options = DEFAULT_EMIT_OPTIONS) {
    const opts = { ...DEFAULT_EMIT_OPTIONS, ...options };
    const normalized = normalizeAll(viewTypes);
    return normalized.map((v) => emitForView({ view: v, viewTypes, datasource, options: opts }));
}
const baseCreateEmitter = viewEmitter((view, ctx) => {
    const file = emitForView({
        view,
        viewTypes: ctx.opts.viewTypes,
        datasource: ctx.opts.datasourceTypes,
        options: ctx.opts,
    });
    if (!ctx.byFeature)
        return file;
    const stem = `${ctx.names.fileBase(view.name, "view-type")}${ctx.names.bfRoleExt("view-type")}`;
    return {
        ...file,
        path: ctx.layout.testPath(view.name, "view-type", {
            fileName: `${stem}.test.ts`,
        }),
    };
});
export const createEmitter = () => {
    const base = baseCreateEmitter(TypescriptImports);
    return {
        emit: (config) => base.emit({
            ...DEFAULT_EMIT_OPTIONS,
            ...testCasingOptionsFromSettings(config),
            ...config,
        }),
    };
};
