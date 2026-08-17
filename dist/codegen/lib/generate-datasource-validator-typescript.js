import { toCase } from "@deterministic-code/generator-sdk/case";
import { entryOf, isFiniteInt, } from "@deterministic-code/generator-sdk/generator-shared";
import { datasourceValidatorGenerator } from "@deterministic-code/generator-sdk/codegen-context";
import { validatorOptionsFromSettings } from "@deterministic-code/generator-sdk/codegen/lib/generate-settings-options";
import { datasourceSettingsFor } from "@deterministic-code/generator-sdk/codegen/lib/ts-datasource-settings";
import { loadFieldTypeCatalog } from "@deterministic-code/generator-sdk/lib/field-type-catalog";
import { fieldConverterFor } from "@deterministic-code/generator-sdk/lib/field-converter";
import { parseDefaultToken, GENERATIVE_TOKENS, } from "@deterministic-code/generator-sdk/lib/default-token";
import { STANDARD_COLUMNS, } from "@deterministic-code/generator-sdk/codegen/lib/datasource-validator-generate-types";
const CATALOG = await loadFieldTypeCatalog();
const TS_CONVERTERS = new Map();
/** The TypeScript field converter for a datetime representation, cached — defaults render through it so symbolic tokens become expressions, not string literals. */
function tsConverter(datetimeRepr) {
    if (!TS_CONVERTERS.has(datetimeRepr)) {
        TS_CONVERTERS.set(datetimeRepr, fieldConverterFor({
            targetKind: "language",
            target: "typescript",
            catalog: CATALOG,
            datetimeRepr,
        }));
    }
    return TS_CONVERTERS.get(datetimeRepr);
}
/** The argument for a Zod `.default(…)` — a generative token (Now/UtcNow/NewId) becomes a thunk so each parse gets a fresh value; a static default is the literal itself. */
function zodDefaultArg(fdef, datetimeRepr) {
    const value = fdef.default_value;
    if (value === null)
        return "null";
    if (typeof value === "object")
        return JSON.stringify(value);
    const { token } = parseDefaultToken(fdef.type, value);
    const literal = tsConverter(datetimeRepr).defaultLiteral(fdef.type, value);
    return GENERATIVE_TOKENS.has(token) ? `() => ${literal}` : literal;
}
export const DEFAULT_GENERATE_OPTIONS = {
    schemaVersion: "1.0",
    withTypeAnnotation: true,
    createIndex: true,
};
const BASE_ZOD = {
    string: "z.string()",
    character: "z.string()",
    decimal: "z.string()",
    number: "z.number()",
    integer: "z.number()",
    smallinteger: "z.number()",
    float: "z.number()",
    reference: "z.number()",
    biginteger: "z.number()",
    boolean: "z.boolean()",
    binary: "z.string().base64()",
    uuid: "z.string().uuid()",
};
function schemaIdent(name) {
    return `${toCase(name, "Camel")}Schema`; // lint-generator-casing-allow: toCase
}
function baseZodFor(type, datetime) {
    if (type === "datetime") {
        return datetime === "native" ? "z.date()" : "z.string()";
    }
    const expr = BASE_ZOD[type];
    if (!expr)
        throw new Error(`Unknown datasource field type: ${type}`);
    return expr;
}
function tightenString(base, fdef) {
    let e = `${base}.trim()`;
    if (isFiniteInt(fdef.min_size) && fdef.min_size >= 0) {
        e = `${e}.min(${fdef.min_size})`;
    }
    if (isFiniteInt(fdef.size) && fdef.size >= 0) {
        e = `${e}.max(${fdef.size})`;
    }
    return e;
}
function tightenInteger(base, fdef, { isFk, isIdLike }) {
    let e = `${base}.int()`;
    if (isFk || isIdLike)
        e = `${e}.nonnegative()`;
    if (isFiniteInt(fdef.min_size))
        e = `${e}.min(${fdef.min_size})`;
    if (isFiniteInt(fdef.size))
        e = `${e}.max(${fdef.size})`;
    return e;
}
function tightenExpr(fieldName, fdef, datetime) {
    const base = baseZodFor(fdef.type, datetime);
    const isFk = typeof fdef.references === "string" && fdef.references.length > 0;
    const isIdLike = fieldName === "id" || fieldName.endsWith("_id");
    switch (fdef.type) {
        case "string":
        case "character":
            return tightenString(base, fdef);
        case "datetime":
            return datetime === "native" ? base : `${base}.trim()`;
        case "number":
        case "integer":
        case "biginteger":
        case "smallinteger":
        case "reference":
            return tightenInteger(base, fdef, { isFk, isIdLike });
        case "float":
            return isFiniteInt(fdef.min_size)
                ? `${base}.min(${fdef.min_size})`
                : base;
        default:
            return base;
    }
}
function zodForField(fieldName, fdef, ctx) {
    const ds = datasourceSettingsFor(ctx.opts);
    let expr = ds.referenceIsUuid(fdef.references)
        ? ds.zodIdType()
        : tightenExpr(fieldName, fdef, ctx.opts.datetime);
    if (fdef.is_nullable === true)
        expr = `${expr}.nullable()`;
    if (Object.prototype.hasOwnProperty.call(fdef, "default_value")) {
        expr = `${expr}.default(${zodDefaultArg(fdef, ctx.opts.datetime)})`;
    }
    return `  ${ctx.fields.ident(fieldName)}: ${expr},`;
}
function standardLines(ctx) {
    const ds = datasourceSettingsFor(ctx.opts);
    return STANDARD_COLUMNS.filter((c) => ds.withUuidColumn || c.name !== "uuid").map((col) => {
        const expr = col.name === "id"
            ? ds.zodIdType()
            : tightenExpr(col.name, { type: col.type }, ctx.opts.datetime);
        return `  ${ctx.fields.ident(col.name)}: ${expr},`;
    });
}
function renderTable(tableEntry, ctx) {
    const { names } = ctx;
    const [tableName, tableDefRaw] = entryOf(tableEntry);
    const fields = tableDefRaw.fields;
    const userFieldNames = new Set(fields.map((f) => ctx.fields.name(entryOf(f)[0])));
    const keyOf = (line) => {
        const m = line.match(/^\s*("?[A-Za-z_$][A-Za-z0-9_$]*"?)\s*:/);
        return m[1].replace(/^"|"$/g, "");
    };
    const fieldLines = [
        ...standardLines(ctx).filter((line) => !userFieldNames.has(keyOf(line))),
        ...fields.map((f) => {
            const [fname, fdef] = entryOf(f);
            return zodForField(fname, fdef, ctx);
        }),
    ].join("\n");
    const schemaName = schemaIdent(tableName);
    const header = `// schema-version: ${ctx.opts.schemaVersion}\nimport { z } from "zod";\n\n`;
    const schemaDecl = `export const ${schemaName} = z.object({\n${fieldLines}\n});`;
    const typeLine = ctx.opts.withTypeAnnotation
        ? `\n\nexport type ${names.className(tableName)}Validated = z.infer<typeof ${schemaName}>;\n`
        : "\n";
    return {
        path: ctx.layout.filePath(tableName, "datasource-validator"),
        content: `${header}${schemaDecl}${typeLine}`,
    };
}
function indexLine(entry, ctx) {
    const [tableName] = entryOf(entry);
    const file = ctx.names.fileBase(tableName, "datasource-validator");
    const schemaName = schemaIdent(tableName);
    const lines = [`export { ${schemaName} } from "./${file}";`];
    if (ctx.opts.withTypeAnnotation) {
        lines.push(`export type { ${ctx.names.className(tableName)}Validated } from "./${file}";`);
    }
    return lines.join("\n");
}
const baseCreateGenerator = datasourceValidatorGenerator(renderTable, indexLine);
/** Generator owns its options: apply this dialect's DEFAULT_GENERATE_OPTIONS, then datasource overrides read from settings, then the dispatched config. */
export const createGenerator = () => {
    const base = baseCreateGenerator();
    return {
        generate: (config) => base.generate({
            ...DEFAULT_GENERATE_OPTIONS,
            ...validatorOptionsFromSettings(config.settings),
            ...config,
        }),
    };
};
