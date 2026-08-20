import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  viewPaths,
  type ViewPaths,
} from "./common/paths.ts";
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

type EmitOptions = ShapeOpts & {
  naming: ViewPaths;
  schemaVersion: string;
};

const emitOptions = (
  settings: Record<string, string>,
  naming: ViewPaths,
  tables: ShapeOpts["tables"],
  views: ShapeOpts["views"],
  referenceBackendType: boolean,
): EmitOptions => ({
  naming,
  schemaVersion: settings["codegen.schema_version"] ?? "1.0",
  tables,
  views,
  referenceBackendType,
});

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
  return content(
    opts.naming.testPath(view.name),
    fill(typeTestTmpl, {
      prelude: preludeSource(fakeTestData),
      schemaVersion: opts.schemaVersion,
      className: opts.naming.className(view.name),
      viewName: view.name,
      typeImport: opts.naming.testImport(view.name),
      isShaped: view.kind === "shaped",
      isUnion: view.kind === "union",
      fixture: fields.length === 0 ? "{}" : renderObject(fields),
      fieldTests: fields
        .map((field) =>
          renderFieldTests(field, opts.naming.className(view.name)),
        )
        .join(""),
      members:
        view.kind === "union"
          ? view.members.map((name) => ({
              name,
              memberClass: opts.naming.className(name),
              memberImport: opts.naming.importSpecifier(view.name, {
                entity: name,
                kind: "view",
              }),
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
  naming: ViewPaths,
  referenceBackendType: boolean,
): GenerateEntry[] => {
  const views = deterministic.expandedViewTypes;
  const opts = emitOptions(
    settings,
    naming,
    new Map(deterministic.expandedDatasourceTypes.map((t) => [t.name, t])),
    new Map(views.map((v) => [v.name, v])),
    referenceBackendType,
  );
  return views.map((view) => renderTests(view, opts));
};

export const generate = async (
  ctx: GenerateContext,
  naming: ViewPaths = viewPaths(ctx.settings),
  referenceBackendType = true,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(VIEW_TYPES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.settings,
    naming,
    referenceBackendType,
  );
};
