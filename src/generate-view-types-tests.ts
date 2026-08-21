import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  VIEW_TYPES_YAML,
  type ViewType,
} from "@deterministic-code/generators-common/specification";
import {
  fieldTestsTmpl,
  typeTestTmpl,
} from "./resources/view-types-tests.ts";
import { preludeSource, fakeTestData } from "./common/fake-test-data.ts";
import {
  renderObject,
  renderValue,
  shapedViewNodes,
  viewNodes,
  type ShapeNode,
  type ShapeOpts,
} from "./common/view-test-shape.ts";
import {
  createImportGenerator,
  type TypeScriptImportGenerator,
} from "./import-generator.ts";

type EmitOptions = ShapeOpts & {
  imports: TypeScriptImportGenerator;
  schemaVersion: string;
};

const emitOptions = (
  settings: Record<string, string>,
  tables: ShapeOpts["tables"],
  views: ShapeOpts["views"],
  referenceBackendType: boolean,
  basePath: string,
): EmitOptions => ({
  imports: createImportGenerator(basePath, settings),
  schemaVersion: settings["codegen.schema_version"] ?? "1.0",
  tables,
  views,
  referenceBackendType,
});

const viewRel = (entity: string, opts: EmitOptions): string =>
  opts.imports.viewRel(entity);

const renderFieldTests = (node: ShapeNode, className: string): string =>
  fill(fieldTestsTmpl, {
    className,
    testName: node.testName,
    ident: node.ident,
    access: node.access,
    sampleExpr: renderValue(node),
    nextExpr: renderValue(node),
    nullable: node.nullable,
    isRoot: node.isRoot,
    nestedTests: node.nested
      .map((child) => renderFieldTests(child, className))
      .join(""),
  }).trimEnd() + "\n\n";

const renderTests = (view: ViewType, opts: EmitOptions): GenerateEntry => {
  const fields =
    view.kind === "shaped" ? shapedViewNodes(view, opts) : [];
  const src = opts.imports.view(view.name);
  return content(
    opts.imports.test(src, view.name),
    fill(typeTestTmpl, {
      prelude: preludeSource(fakeTestData),
      schemaVersion: opts.schemaVersion,
      className: view.name,
      viewName: view.name,
      typeImport: opts.imports.testSpec(src, view.name),
      isShaped: view.kind === "shaped",
      isUnion: view.kind === "union",
      fixture: fields.length === 0 ? "{}" : renderObject(fields),
      fieldTests: fields
        .map((field) =>
          renderFieldTests(field, view.name),
        )
        .join(""),
      members:
        view.kind === "union"
          ? view.members.map((name) => ({
              name,
              memberClass: name,
              memberImport: opts.imports.spec(
                viewRel(view.name, opts),
                viewRel(name, opts),
              ),
              memberFixture: renderObject(
                viewNodes(name, opts, new Set([view.name])),
              ),
            }))
          : [],
    }),
  );
};

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
  referenceBackendType: boolean,
  basePath: string,
): GenerateEntry[] => {
  const views = deterministic.expandedViewTypes;
  const opts = emitOptions(
    settings,
    new Map(deterministic.expandedDatasourceTypes.map((t) => [t.name, t])),
    new Map(views.map((v) => [v.name, v])),
    referenceBackendType,
    basePath,
  );
  return views.map((view) => renderTests(view, opts));
};

export const generate = async (
  ctx: GenerateContext,
  basePath = ".",
  referenceBackendType = true,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(VIEW_TYPES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.settings,
    referenceBackendType,
    basePath,
  );
};
