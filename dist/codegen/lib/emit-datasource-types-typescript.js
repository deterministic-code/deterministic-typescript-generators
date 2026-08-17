import { DEFAULT_COMMENT_STYLE } from "@deterministic-code/generator-sdk/emit-doc-comment";
import { datasourceTypesEmitter } from "@deterministic-code/generator-sdk/codegen-context";
import { datasourceTypesModule } from "@deterministic-code/generator-sdk/codegen/lib/emit-settings-options";
import { normalizeDatasourceTable } from "@deterministic-code/generator-sdk/codegen/lib/datasource-normalize";
import { TypescriptImports } from "./typescript-imports.js";
import { createTypeMapper } from "@deterministic-code/generator-sdk/codegen/lib/type-mapper";
import { datasourceSettingsFor } from "@deterministic-code/generator-sdk/codegen/lib/ts-datasource-settings";
import { datasourceTypeDoc } from "@deterministic-code/generator-sdk/codegen/lib/datasource-types-emit-types";
export const DEFAULT_EMIT_OPTIONS = {
    baseClass: "StandardDataSource",
    language: "typescript",
    schemaVersion: "1.0",
    style: DEFAULT_COMMENT_STYLE,
};
const mapAbstractType = createTypeMapper("typescript");
function normalizeTable(entry) {
    return normalizeDatasourceTable(entry);
}
function mapType(type, datetime) {
    return mapAbstractType(type, { datetime });
}
function emitField(field, ctx) {
    const ds = datasourceSettingsFor(ctx.opts);
    const tsType = ds.referenceIsUuid(field.references)
        ? ds.tsIdType()
        : mapType(field.type, ctx.opts.datetime);
    const nullable = field.isNullable ? " | null" : "";
    return `  ${ctx.fields.ident(field.name)}: ${tsType}${nullable};`;
}
export function resolveBaseClass({ idType, withUuidColumn, datetime, }) {
    const baseClass = withUuidColumn
        ? "StandardDataSourceWithUuid"
        : "StandardDataSource";
    const idT = datasourceSettingsFor({ idType }).tsIdType();
    const dtT = datetime === "string" ? "string" : "Date";
    const typeArgs = withUuidColumn ? [idT, "string", dtT] : [idT, dtT];
    return { baseClass, imports: [baseClass], typeArgs };
}
function renderTable(table, ctx) {
    const { names, opts, layout, imports: importer } = ctx;
    const className = names.className(table.name);
    const withUuidColumn = datasourceSettingsFor(opts).withUuidColumn && opts.withUuidColumn;
    const { baseClass, imports, typeArgs } = resolveBaseClass({
        idType: opts.idType,
        withUuidColumn,
        datetime: opts.datetime,
    });
    const bodyFields = withUuidColumn
        ? table.fields
        : table.fields.filter((f) => f.name !== "uuid");
    const body = bodyFields.map((f) => emitField(f, ctx)).join("\n");
    const doc = datasourceTypeDoc({
        className,
        datasourceType: table.datasourceType,
        fieldCount: bodyFields.length,
        style: opts.style,
    });
    const emitPath = layout.filePath(table.name, "datasource-type");
    const typesImport = importer.library("types", opts.libraryReferenceMode, {
        entity: table.name,
        artifact: "datasource-type",
    });
    const content = `// schema-version: ${opts.schemaVersion}
import type { ${imports.join(", ")} } from "${typesImport}";

${doc}export interface ${className} extends ${baseClass}<${typeArgs.join(", ")}> {
${body}
}
`;
    return { path: emitPath, content };
}
function indexLine(table, ctx) {
    return `export { ${ctx.names.className(table.name)} } from "./${ctx.names.fileBase(table.name, "datasource-type")}";`;
}
const baseEmit = datasourceTypesEmitter(normalizeTable, renderTable, indexLine)(TypescriptImports);
export const { render, createEmitter, emit } = datasourceTypesModule({
    baseEmit,
    defaultEmitOptions: DEFAULT_EMIT_OPTIONS,
    language: "typescript",
});
