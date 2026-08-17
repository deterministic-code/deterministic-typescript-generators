import { join } from "node:path";
import { CodegenFieldNames } from "@deterministic-code/generator-sdk/field-names";
import { namesForSettings } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { datetimeOptionFromSettings } from "@deterministic-code/generator-sdk/codegen/lib/emit-settings-options";
import { schemaSymbol, validatedSymbol } from "./zod-schema-names.js";
import { refName, validatorObjectEntries } from "./frontend-bindings-routes.js";
import { PATCH } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
const ZOD_VERSION = "^3.23.8";
function registerRef(name, ctx) {
    if (!ctx.componentNames.has(name)) {
        throw new Error(`frontend_validators: $ref to unknown component "${name}"`);
    }
    ctx.refs.add(name);
}
function isIdLike(prop, keyHint) {
    return Boolean(prop["x-references"] ||
        keyHint === "id" ||
        (keyHint && keyHint.endsWith("_id")));
}
function scalarZod(prop, ctx, keyHint) {
    switch (prop.type) {
        case "integer":
            return isIdLike(prop, keyHint)
                ? "z.number().int().nonnegative()"
                : "z.number().int()";
        case "number":
            // a foreign-key reference surfaces as {type:number, x-references}; tighten it to a non-negative int like the backend validator, leaving genuine decimals as z.number().
            return prop["x-references"]
                ? "z.number().int().nonnegative()"
                : "z.number()";
        case "boolean":
            return "z.boolean()";
        case "string":
            if (prop.format === "uuid")
                return "z.string().uuid()";
            // wire JSON carries a datetime as a string; z.coerce.date() accepts that string and yields a Date so the inferred type matches frontend_types' native Date, while the string mode keeps it a string.
            if (prop.format === "date-time") {
                return ctx.datetime === "native" ? "z.coerce.date()" : "z.string()";
            }
            return Number.isFinite(prop.maxLength)
                ? `z.string().max(${prop.maxLength})`
                : "z.string()";
        default:
            throw new Error(`frontend_validators: unmapped scalar ${JSON.stringify(prop)}`);
    }
}
function baseZod(prop, ctx, keyHint) {
    if (prop.$ref) {
        const name = refName(prop.$ref);
        registerRef(name, ctx);
        return `z.lazy(() => ${schemaSymbol(name, ctx.names)})`;
    }
    if (Array.isArray(prop.oneOf)) {
        return `z.union([${prop.oneOf.map((m) => baseZod(m, ctx, null)).join(", ")}])`;
    }
    if (prop.type === "array") {
        return `z.array(${baseZod(prop.items, ctx, null)})`;
    }
    if (Array.isArray(prop.enum) && prop.type === "string") {
        return `z.enum([${prop.enum.map((v) => JSON.stringify(v)).join(", ")}])`;
    }
    return scalarZod(prop, ctx, keyHint);
}
function fieldZod(key, prop, ctx) {
    let expr = baseZod(prop, ctx, key);
    if (prop.nullable === true)
        expr = `${expr}.nullable()`;
    if (ctx.requiredSet && !ctx.requiredSet.has(key)) {
        expr = `${expr}.optional()`;
    }
    return `  ${ctx.fields.ident(key)}: ${expr},`;
}
function renderComponent(name, schema, ctx) {
    const symbol = schemaSymbol(name, ctx.names);
    if (Array.isArray(schema.oneOf)) {
        const members = schema.oneOf.map((m) => baseZod(m, ctx, null));
        const body = members.length === 1 ? members[0] : `z.union([${members.join(", ")}])`;
        return `export const ${symbol} = ${body};`;
    }
    const props = schema.properties ?? {};
    const fieldCtx = {
        ...ctx,
        requiredSet: Array.isArray(schema.required)
            ? new Set(schema.required)
            : null,
    };
    const lines = Object.keys(props).map((key) => fieldZod(key, props[key], fieldCtx));
    const body = lines.length ? `\n${lines.join("\n")}\n` : "";
    return `export const ${symbol} = z.object({${body}});`;
}
function renderObjectValidators(closure, components, base) {
    const ctx = {
        ...base,
        componentNames: closure,
        refs: new Set(),
    };
    const names = [...closure].sort((a, b) => schemaSymbol(a, base.names).localeCompare(schemaSymbol(b, base.names)));
    const bodies = names.map((name) => renderComponent(name, components[name], ctx));
    const aliases = names.map((name) => `export type ${validatedSymbol(name, base.names)} = z.infer<typeof ${schemaSymbol(name, base.names)}>;`);
    return `import { z } from "zod";\n\n${bodies.join("\n\n")}\n\n${aliases.join("\n")}\n`;
}
/** The emitted validators.ts files `import { z } from "zod"`, so the frontend needs zod at runtime — add it (add-if-absent, deep-merged) rather than leaving a dangling import the emitted app can't resolve. */
function zodDependencyPatch() {
    return {
        kind: PATCH,
        filename: join("frontend", "package.json"),
        content: JSON.stringify({ dependencies: { zod: ZOD_VERSION } }),
    };
}
/** Emit a self-contained zod validators file per object, placed by layout mode via `CodegenLayout.frontendValidatorFile` (flat `validators/<object>.ts`, by-feature `features/<object>/validators.ts`) — driven by the same `frontend_bindings.yaml` + route projection as `client_bindings`, so validators track the clients. Each file holds the zod schemas for the read + create/update/eager types that object's routes send/receive (transitive `$ref` closure); `client_bindings` imports them through the layout's `frontendRelImport`. Always emits when the step runs; `settings.frontend.generate_validators` gates only whether the frontend `--all` sweep includes this step (see emit.mjs runAll). `$ref` becomes `z.lazy(() => XSchema)` so circular refs survive ESM module init; datetime honors the setting (native → `z.coerce.date()`). */
export async function emit({ inputs, settings }) {
    const names = namesForSettings(settings, "typescript");
    const fields = new CodegenFieldNames({ fieldFormat: names.fieldFormat });
    const base = {
        names,
        fields,
        datetime: datetimeOptionFromSettings(settings).datetime,
    };
    const entries = await validatorObjectEntries({ inputs, settings }, { test: false }, (closure, components) => renderObjectValidators(closure, components, base));
    if (entries.length > 0)
        entries.push(zodDependencyPatch());
    return { entries };
}
export const entriesNative = true;
export const assembleAfterStep = true;
