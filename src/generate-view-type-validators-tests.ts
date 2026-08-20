import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  viewValidatorPaths,
  type ViewValidatorPaths,
} from "./common/paths.ts";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  VIEW_TYPES_YAML,
  type ShapedView,
  type ViewType,
} from "@deterministic-code/generators-common/specification";
import { preludeSource, fakeTestData } from "./common/fake-test-data.ts";
import { typeTestTmpl } from "./resources/view-type-validators-tests.ts";
import {
  escapeTestName,
  flattenNodes,
  renderMutatedObject,
  renderObject,
  shapedViewNodes,
  viewNodes,
  type ShapeNode,
  type ShapeOpts,
} from "./common/view-test-shape.ts";

type EmitOptions = ShapeOpts & {
  naming: ViewValidatorPaths;
  schemaVersion: string;
};

type CaseTok = {
  name: string;
  fixture: string;
  assertion: string;
};

const MUTABLE_SCALAR = new Set([
  "string",
  "number",
  "boolean",
  "datetime",
  "reference",
  "binary",
]);

const emitBase = (
  settings: Record<string, string>,
  naming: ViewValidatorPaths,
) => {
  return {
    naming,
    schemaVersion: settings["codegen.schema_version"] ?? "1.0",
  };
};

const wrongTypeExpr = (type: string): string | undefined => {
  switch (type) {
    case "string":
      return "123";
    case "number":
    case "reference":
      return `"not-a-number"`;
    case "boolean":
      return `"not-a-boolean"`;
    case "datetime":
      return "42";
    case "binary":
      return `"not-binary"`;
    default:
      return undefined;
  }
};

const mutationCases = (
  roots: ShapeNode[],
  targets: ShapeNode[],
  { inherited = false } = {},
): CaseTok[] => {
  const cases: CaseTok[] = [];
  for (const field of targets) {
    const missingPrefix = inherited
      ? "missing inherited required field"
      : "missing required field";
    const nullPrefix = inherited
      ? "null for non-nullable inherited field"
      : "null for non-nullable field";
    if (!field.nullable && !field.hasDefault) {
      cases.push({
        name: escapeTestName(
          `rejects when ${missingPrefix} "${field.path}"`,
        ),
        fixture: renderMutatedObject(roots, field, "omit"),
        assertion: "toThrow",
      });
      cases.push({
        name: escapeTestName(
          `rejects when ${nullPrefix} "${field.path}"`,
        ),
        fixture: renderMutatedObject(roots, field, "null"),
        assertion: "toThrow",
      });
      if (inherited) break;
    }
    if (inherited) continue;
    if (MUTABLE_SCALAR.has(field.type)) {
      const bad = wrongTypeExpr(field.type);
      if (bad !== undefined) {
        cases.push({
          name: escapeTestName(
            `rejects when wrong type on field "${field.path}"`,
          ),
          fixture: renderMutatedObject(roots, field, bad),
          assertion: "toThrow",
        });
      }
    }
  }
  return cases;
};

const shapedCases = (view: ShapedView, opts: EmitOptions): CaseTok[] => {
  const fields = shapedViewNodes(view, opts);
  const declared = view.fields.map((declaredField) => {
    const node = fields.find((f) => f.name === declaredField.name);
    if (node === undefined) {
      throw new Error(`missing shaped field ${declaredField.name}`);
    }
    return node;
  });
  const cases: CaseTok[] = [
    {
      name: "parses a valid payload",
      fixture: renderObject(fields),
      assertion: "not.toThrow",
    },
  ];
  if (fields.some((f) => f.nullable)) {
    cases.push({
      name: "accepts null for nullable fields",
      fixture: renderObject(
        fields.map((f) =>
          f.nullable
            ? {
                ...f,
                isObject: false,
                isPrimitive: true,
                isArray: false,
                expr: "null",
                nested: [],
              }
            : f,
        ),
      ),
      assertion: "not.toThrow",
    });
  }
  const inheritedMutation = fields.find(
    (f) =>
      !declared.some((d) => d.name === f.name) && !f.nullable && !f.hasDefault,
  );
  if (inheritedMutation !== undefined) {
    cases.push(
      ...mutationCases(fields, [inheritedMutation], { inherited: true }),
    );
  }
  cases.push(...mutationCases(fields, flattenNodes(declared)));
  return cases;
};

const unionCases = (
  view: Extract<ViewType, { kind: "union" }>,
  opts: EmitOptions,
): CaseTok[] => {
  const cases = view.members.map((name) => ({
    name: escapeTestName(`accepts a ${name} member`),
    fixture: renderObject(viewNodes(name, opts, new Set([view.name]))),
    assertion: "not.toThrow",
  }));
  cases.push({
    name: escapeTestName(
      `rejects when matches neither member of union "${view.name}"`,
    ),
    fixture: `{ __not_a_member__: true }`,
    assertion: "toThrow",
  });
  return cases;
};

const renderTests = (view: ViewType, opts: EmitOptions): GenerateEntry =>
  content(
    opts.naming.testPath(view.name),
    fill(typeTestTmpl, {
      prelude: preludeSource(fakeTestData),
      schemaVersion: opts.schemaVersion,
      schemaName: `${view.name}Schema`,
      viewName: view.name,
      schemaImport: opts.naming.testImport(view.name),
      cases:
        view.kind === "union" ? unionCases(view, opts) : shapedCases(view, opts),
    }),
  );

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
  naming: ViewValidatorPaths,
  referenceBackendType: boolean,
): GenerateEntry[] => {
  const base = emitBase(settings, naming);
  const views = deterministic.expandedViewTypes;
  const opts: EmitOptions = {
    ...base,
    tables: new Map(
      deterministic.expandedDatasourceTypes.map((t) => [t.name, t]),
    ),
    views: new Map(views.map((v) => [v.name, v])),
    referenceBackendType,
  };
  return views.map((view) => renderTests(view, opts));
};

export const generate = async (
  ctx: GenerateContext,
  naming: ViewValidatorPaths = viewValidatorPaths(ctx.settings),
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
