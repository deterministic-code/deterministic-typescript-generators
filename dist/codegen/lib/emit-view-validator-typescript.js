import { toCase } from "@deterministic-code/generator-sdk/case";
import { viewEmitter } from "@deterministic-code/generator-sdk/codegen-context";
import { TypescriptImports } from "./typescript-imports.js";
import { datetimeMergeEmitter, validatorOptionsFromSettings, } from "@deterministic-code/generator-sdk/codegen/lib/emit-settings-options";
import { datasourceSettingsFor } from "@deterministic-code/generator-sdk/codegen/lib/ts-datasource-settings";
export const DEFAULT_EMIT_OPTIONS = {
    schemaVersion: "1.0",
    datasourceImportPath: "../../datasource/validators",
    withTypeAnnotation: true,
    createIndex: true,
};
function viewSchemaIdent(name) {
    return `${toCase(name, "Camel")}Schema`; // lint-emitter-casing-allow: toCase
}
function datasourceSchemaIdent(name) {
    return `datasource${toCase(name, "Pascal")}Schema`; // lint-emitter-casing-allow: toCase
}
function crudTrioIdents(name) {
    const pascal = toCase(name, "Pascal"); // lint-emitter-casing-allow: toCase
    return {
        create: `create${pascal}Schema`,
        update: `update${pascal}Schema`,
        patch: `patch${pascal}Schema`,
    };
}
function tightenStringPrimitive(field) {
    let expr = "z.string().trim()";
    const min = field.minSize;
    const max = field.size;
    if (Number.isInteger(min) && min >= 0)
        expr = `${expr}.min(${min})`;
    if (Number.isInteger(max) && max >= 0)
        expr = `${expr}.max(${max})`;
    return expr;
}
function tightenNumberPrimitive(field) {
    let expr = "z.number().int()";
    const fname = field.name;
    const isIdLike = fname === "id" || (typeof fname === "string" && fname.endsWith("_id"));
    if (isIdLike)
        expr = `${expr}.nonnegative()`;
    const min = field.minSize;
    const max = field.size;
    if (Number.isInteger(min))
        expr = `${expr}.min(${min})`;
    if (Number.isInteger(max))
        expr = `${expr}.max(${max})`;
    return expr;
}
function tightenPrimitive(base, field, opts) {
    if (base === "datetime") {
        return opts.datetime === "native" ? "z.date()" : "z.string().trim()";
    }
    if (base === "string")
        return tightenStringPrimitive(field);
    if (base === "number")
        return tightenNumberPrimitive(field);
    return `z.${base}()`;
}
function zodForField(field, ctx) {
    const { parsed } = field;
    let expr;
    switch (parsed.kind) {
        case "primitive":
            expr = tightenPrimitive(parsed.base, field, ctx.opts);
            break;
        case "datasource":
            expr = `z.lazy(() => ${datasourceSchemaIdent(parsed.base)})`;
            break;
        case "view":
            expr = `z.lazy(() => ${viewSchemaIdent(parsed.base)})`;
            break;
        default:
            throw new Error(`Unknown field kind: ${parsed.kind}`);
    }
    if (parsed.isArray)
        expr = `z.array(${expr})`;
    if (field.isNullable)
        expr = `${expr}.nullable()`;
    return `  ${ctx.fields.ident(field.name)}: ${expr},`;
}
function buildImports(view, ctx) {
    const { names, opts, imports } = ctx;
    const from = { entity: view.name, artifact: "view-validator" };
    const byPath = new Map();
    const add = (sortKey, emitPath, token) => {
        if (!byPath.has(sortKey))
            byPath.set(sortKey, { emitPath, tokens: new Set() });
        byPath.get(sortKey).tokens.add(token);
    };
    const datasourceSeen = new Set();
    const addDatasource = (baseName) => {
        if (datasourceSeen.has(baseName))
            return;
        datasourceSeen.add(baseName);
        const localAlias = datasourceSchemaIdent(baseName);
        const imported = viewSchemaIdent(baseName);
        const flatPath = `${opts.datasourceImportPath}/${names.fileBase(baseName, "datasource-validator")}`;
        const emitPath = ctx.byFeature
            ? imports.crossArtifact(from, {
                entity: baseName,
                artifact: "datasource-validator",
            })
            : flatPath;
        add(flatPath, emitPath, `${imported} as ${localAlias}`);
    };
    const viewSeen = new Set();
    const addView = (baseName) => {
        if (baseName === view.name || viewSeen.has(baseName))
            return;
        viewSeen.add(baseName);
        const flatPath = `./${names.fileBase(baseName, "view-validator")}`;
        const emitPath = ctx.byFeature
            ? imports.crossArtifact(from, {
                entity: baseName,
                artifact: "view-validator",
            })
            : flatPath;
        add(flatPath, emitPath, viewSchemaIdent(baseName));
    };
    if (view.kind === "shaped") {
        if (view.inherits)
            addDatasource(view.inherits);
        for (const f of view.fields) {
            if (f.parsed.kind === "datasource")
                addDatasource(f.parsed.base);
            else if (f.parsed.kind === "view")
                addView(f.parsed.base);
        }
    }
    else if (view.kind === "union") {
        for (const m of view.members)
            addView(m);
    }
    return byPath;
}
function renderImports(imports) {
    if (imports.size === 0)
        return "";
    const lines = [];
    const sortKeys = [...imports.keys()].sort();
    for (const sortKey of sortKeys) {
        const { emitPath, tokens } = imports.get(sortKey);
        const toks = [...tokens].sort().join(", ");
        lines.push(`import { ${toks} } from "${emitPath}";`);
    }
    return lines.join("\n");
}
function inheritedUpdateExpr(view, withUuid) {
    const updateBase = datasourceSchemaIdent(view.inherits);
    const baseOmits = withUuid
        ? ['"id"', '"uuid"', '"created"', '"updated"']
        : ['"id"', '"created"', '"updated"'];
    const enrichmentOmits = view.enrichments.map((e) => JSON.stringify(e.fkColumn));
    const omitObj = [...baseOmits, ...enrichmentOmits]
        .map((k) => `${k}: true`)
        .join(", ");
    let expr = `${updateBase}.omit({ ${omitObj} })`;
    if (view.enrichments.length > 0) {
        const extLines = view.enrichments
            .map((e) => `  ${JSON.stringify(e.newField)}: z.string().trim(),`)
            .join("\n");
        expr = `${expr}.extend({\n${extLines}\n})`;
    }
    return expr;
}
function resolveViewOmits(view, withUuid) {
    return (view.omit ?? []).filter((k) => withUuid || k !== "uuid");
}
function shapedBaseSchema(view, ctx, withUuid) {
    const schemaName = viewSchemaIdent(view.name);
    const hasFields = view.fields.length > 0;
    const fieldLines = view.fields.map((f) => zodForField(f, ctx)).join("\n");
    if (!view.inherits) {
        const objectLiteral = hasFields
            ? `z.object({\n${fieldLines}\n})`
            : "z.object({})";
        return `export const ${schemaName} = ${objectLiteral};`;
    }
    const viewOmits = resolveViewOmits(view, withUuid);
    const allOmits = [...view.enrichments.map((e) => e.fkColumn), ...viewOmits];
    let base = datasourceSchemaIdent(view.inherits);
    if (allOmits.length > 0) {
        const omitObj = allOmits
            .map((k) => `${JSON.stringify(k)}: true`)
            .join(", ");
        base = `${base}.omit({ ${omitObj} })`;
    }
    if (viewOmits.length > 0 && !viewOmits.includes("id")) {
        base = `${base}.partial({ id: true })`;
    }
    return hasFields
        ? `export const ${schemaName} = ${base}.extend({\n${fieldLines}\n});`
        : `export const ${schemaName} = ${base};`;
}
function crudTrioDecls(view, baseSchema, withUuid) {
    const trio = crudTrioIdents(view.name);
    if (view.inherits) {
        const updateDecl = `export const ${trio.update} = ${inheritedUpdateExpr(view, withUuid)};`;
        const createDecl = `export const ${trio.create} = ${trio.update};`;
        const patchDecl = `export const ${trio.patch} = ${trio.update}.partial();`;
        return `${baseSchema}\n${updateDecl}\n${createDecl}\n${patchDecl}`;
    }
    const schemaName = viewSchemaIdent(view.name);
    const createDecl = `export const ${trio.create} = ${schemaName};`;
    const updateDecl = `export const ${trio.update} = ${schemaName};`;
    const patchDecl = `export const ${trio.patch} = ${schemaName}.partial();`;
    return `${baseSchema}\n${createDecl}\n${updateDecl}\n${patchDecl}`;
}
function emitShapedSchema(view, ctx) {
    const withUuid = datasourceSettingsFor(ctx.opts).withUuidColumn;
    const baseSchema = shapedBaseSchema(view, ctx, withUuid);
    if (resolveViewOmits(view, withUuid).length > 0)
        return baseSchema;
    return crudTrioDecls(view, baseSchema, withUuid);
}
function emitUnionSchema(view) {
    const schemaName = viewSchemaIdent(view.name);
    const members = view.members
        .map((m) => `z.lazy(() => ${viewSchemaIdent(m)})`)
        .join(",\n  ");
    return `export const ${schemaName} = z.union([\n  ${members},\n]);`;
}
function typeAnnotationLine(view, ctx) {
    if (!ctx.opts.withTypeAnnotation)
        return "";
    const cls = ctx.names.className(view.name);
    const schemaName = viewSchemaIdent(view.name);
    return `export type ${cls}Validated = z.infer<typeof ${schemaName}>;`;
}
function renderView(view, ctx) {
    const emitPath = ctx.layout.filePath(view.name, "view-validator");
    const extraImports = renderImports(buildImports(view, ctx));
    const zodImport = `import { z } from "zod";`;
    const importBlock = extraImports
        ? `${zodImport}\n${extraImports}`
        : zodImport;
    const header = `// schema-version: ${ctx.opts.schemaVersion}\n${importBlock}\n\n`;
    const schemaBody = view.kind === "union" ? emitUnionSchema(view) : emitShapedSchema(view, ctx);
    const typeLine = typeAnnotationLine(view, ctx);
    const trailing = typeLine ? `\n\n${typeLine}\n` : "\n";
    return { path: emitPath, content: `${header}${schemaBody}${trailing}` };
}
function indexLine(v, ctx) {
    const omitKeys = v.kind === "shaped" ? v.omit : [];
    if ((omitKeys ?? []).length > 0)
        return null;
    const file = ctx.names.fileBase(v.name, "view-validator");
    const schemaName = viewSchemaIdent(v.name);
    const lines = [];
    if (v.kind === "union") {
        lines.push(`export { ${schemaName} } from "./${file}";`);
    }
    else {
        const trio = crudTrioIdents(v.name);
        const schemas = [schemaName, trio.create, trio.update, trio.patch].join(", ");
        lines.push(`export { ${schemas} } from "./${file}";`);
    }
    if (ctx.opts.withTypeAnnotation) {
        const typeName = `${ctx.names.className(v.name)}Validated`;
        lines.push(`export type { ${typeName} } from "./${file}";`);
    }
    return lines.join("\n");
}
const baseCreateEmitter = viewEmitter(renderView, indexLine);
export const createEmitter = () => {
    const base = datetimeMergeEmitter(baseCreateEmitter, TypescriptImports, DEFAULT_EMIT_OPTIONS);
    return {
        emit: (config) => base.emit({
            ...validatorOptionsFromSettings(config.settings),
            ...config,
        }),
    };
};
