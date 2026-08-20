import { fill } from "@deterministic-code/generators-common/fill";
import {
  tableFields,
  type DatasourceType,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "@deterministic-code/generators-common/specification-parser";
import { toNative } from "../base-type-converter.ts";
import { valueTmpl } from "../resources/view-types-tests.ts";
import { fakeTestData, fieldExpr } from "./fake-test-data.ts";

export type ShapeNaming = {
  fieldIdent: (name: string) => string;
  fieldName: (name: string) => string;
};

export type ShapeOpts = {
  idType: string;
  naming: ShapeNaming;
  tables: Map<string, DatasourceType>;
  views: Map<string, ViewType>;
};

export type ShapeNode = {
  name: string;
  ident: string;
  access: string;
  path: string;
  testName: string;
  type: string;
  nullable: boolean;
  hasDefault: boolean;
  isArray: boolean;
  isObject: boolean;
  isPrimitive: boolean;
  isRoot: boolean;
  expr: string;
  nested: ShapeNode[];
};

export const escapeTestName = (name: string): string =>
  name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const fieldAccess = (ident: string): string =>
  ident.startsWith('"') ? `[${ident}]` : `.${ident}`;

const primitiveExpr = (type: string, size?: number): string =>
  fieldExpr(fakeTestData, type, {
    nativeType: toNative(type),
    size,
  });

const nestedTokens = (
  nested: ShapeNode[],
): Array<{ ident: string; value: string; last: boolean }> =>
  nested.map((child, i, all) => ({
    ident: child.ident,
    value: renderValue(child),
    last: i === all.length - 1,
  }));

export const renderValue = (
  node: Pick<
    ShapeNode,
    "isArray" | "isObject" | "isPrimitive" | "expr" | "nested"
  >,
): string =>
  fill(valueTmpl, {
    isArray: node.isArray,
    isObject: node.isObject,
    isPrimitive: node.isPrimitive,
    expr: node.expr,
    nested: nestedTokens(node.nested),
  }).trimEnd();

export const renderObject = (fields: ShapeNode[]): string =>
  fill(valueTmpl, {
    isArray: false,
    isObject: true,
    isPrimitive: false,
    expr: "",
    nested: nestedTokens(fields),
  }).trimEnd();

const scalarNode = (
  field: {
    name: string;
    type: string;
    isNullable: boolean;
    hasDefault?: boolean;
    size?: number;
  },
  opts: ShapeOpts,
  accessPrefix: string,
  pathPrefix: string,
  isRoot: boolean,
): ShapeNode => {
  const ident = opts.naming.fieldIdent(field.name);
  const fieldName = opts.naming.fieldName(field.name);
  const path = pathPrefix === "" ? fieldName : `${pathPrefix}.${fieldName}`;
  return {
    name: field.name,
    ident,
    access: `${accessPrefix}${fieldAccess(ident)}`,
    path,
    testName: escapeTestName(path),
    type: field.type,
    nullable: field.isNullable,
    hasDefault: field.hasDefault === true,
    isArray: false,
    isObject: false,
    isPrimitive: true,
    isRoot,
    expr: primitiveExpr(field.type, field.size),
    nested: [],
  };
};

const dsNodes = (
  name: string,
  opts: ShapeOpts,
  accessPrefix: string,
  pathPrefix: string,
): ShapeNode[] => {
  const table = opts.tables.get(name);
  if (table === undefined) return [];
  return tableFields(table.fields, opts.idType).map((f) =>
    scalarNode(f, opts, accessPrefix, pathPrefix, false),
  );
};

const parentNodes = (
  view: ShapedView,
  opts: ShapeOpts,
  accessPrefix: string,
  pathPrefix: string,
  isRoot: boolean,
): ShapeNode[] => {
  if (view.inherits === null) return [];
  const table = opts.tables.get(view.inherits);
  if (table === undefined) return [];
  const omit = new Set([
    ...view.omit,
    ...view.enrichments.map((e) => e.fkColumn),
  ]);
  return tableFields(table.fields, opts.idType)
    .filter((f) => !omit.has(f.name))
    .map((f) => scalarNode(f, opts, accessPrefix, pathPrefix, isRoot));
};

const viewFieldNode = (
  field: ViewField,
  opts: ShapeOpts,
  visited: Set<string>,
  accessPrefix: string,
  pathPrefix: string,
  isRoot: boolean,
): ShapeNode => {
  if (field.kind === "primitive") {
    const ident = opts.naming.fieldIdent(field.name);
    const fieldName = opts.naming.fieldName(field.name);
    const path = pathPrefix === "" ? fieldName : `${pathPrefix}.${fieldName}`;
    return {
      name: field.name,
      ident,
      access: `${accessPrefix}${fieldAccess(ident)}`,
      path,
      testName: escapeTestName(path),
      type: field.base,
      nullable: field.isNullable,
      hasDefault: false,
      isArray: field.isArray,
      isObject: false,
      isPrimitive: true,
      isRoot,
      expr: primitiveExpr(field.base, field.size),
      nested: [],
    };
  }
  const ident = opts.naming.fieldIdent(field.name);
  const fieldName = opts.naming.fieldName(field.name);
  const path = pathPrefix === "" ? fieldName : `${pathPrefix}.${fieldName}`;
  const access = `${accessPrefix}${fieldAccess(ident)}`;
  const childPrefix = field.isArray ? `${access}[0]` : access;
  const nested =
    field.kind === "datasource"
      ? dsNodes(field.base, opts, childPrefix, path)
      : viewNodes(field.base, opts, visited, childPrefix, path);
  return {
    name: field.name,
    ident,
    access,
    path,
    testName: escapeTestName(path),
    type: field.type,
    nullable: field.isNullable,
    hasDefault: false,
    isArray: field.isArray,
    isObject: true,
    isPrimitive: false,
    isRoot,
    expr: "",
    nested,
  };
};

const shapedNodes = (
  view: ShapedView,
  opts: ShapeOpts,
  visited: Set<string>,
  accessPrefix: string,
  pathPrefix: string,
  isRoot: boolean,
): ShapeNode[] => [
  ...parentNodes(view, opts, accessPrefix, pathPrefix, isRoot),
  ...view.fields.map((f) =>
    viewFieldNode(f, opts, visited, accessPrefix, pathPrefix, isRoot),
  ),
];

export const viewNodes = (
  name: string,
  opts: ShapeOpts,
  visited: Set<string>,
  accessPrefix = "",
  pathPrefix = "",
  isRoot = false,
): ShapeNode[] => {
  if (visited.has(name)) return [];
  const view = opts.views.get(name);
  if (view === undefined) return [];
  const next = new Set(visited).add(name);
  if (view.kind === "union") {
    const member = view.members[0];
    return member === undefined
      ? []
      : viewNodes(member, opts, next, accessPrefix, pathPrefix, isRoot);
  }
  return shapedNodes(view, opts, next, accessPrefix, pathPrefix, isRoot);
};

export const shapedViewNodes = (
  view: ShapedView,
  opts: ShapeOpts,
): ShapeNode[] =>
  shapedNodes(view, opts, new Set([view.name]), "", "", true);

export const flattenNodes = (nodes: ShapeNode[]): ShapeNode[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.nested)]);

export const renderMutatedObject = (
  roots: ShapeNode[],
  target: ShapeNode,
  replacement: "omit" | "null" | string,
): string => {
  const children = (
    nodes: ShapeNode[],
  ): Array<{ ident: string; value: string; last: boolean }> => {
    const kept = nodes.filter(
      (node) => !(node === target && replacement === "omit"),
    );
    return kept.map((node, i, all) => {
      let value: string;
      if (node === target) {
        value = replacement === "null" ? "null" : replacement;
      } else if (node.isObject) {
        value = fill(valueTmpl, {
          isArray: node.isArray,
          isObject: true,
          isPrimitive: false,
          expr: "",
          nested: children(node.nested),
        }).trimEnd();
      } else {
        value = renderValue(node);
      }
      return {
        ident: node.ident,
        value,
        last: i === all.length - 1,
      };
    });
  };
  return fill(valueTmpl, {
    isArray: false,
    isObject: true,
    isPrimitive: false,
    expr: "",
    nested: children(roots),
  }).trimEnd();
};
