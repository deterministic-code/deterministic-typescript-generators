import { camelCase, kebabCase } from "change-case";
import pluralize from "pluralize";
import {
  type DatasourceSettings,
} from "./common/datasource-settings.ts";
import { commentStyle, type CommentStyle } from "./common/doc-comment.ts";
import { fill } from "./common/fill.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import {
  type RouteNaming,
} from "./common/naming.ts";
import type { DatasourceType } from "./common/parse-datasource-types.ts";
import {
  type DirectFkDescriptor,
  type M2mDescriptor,
  type NestedRouteDescriptor,
} from "./common/parse-routes.ts";
import { libraryImportSpecifier } from "./library-import.ts";
import { directFkTmpl, m2mTmpl } from "./routes/nested-resources.ts";

type NestedEmitOptions = {
  naming: RouteNaming;
  style: CommentStyle;
  libraryReferenceMode: string | undefined;
  ds: DatasourceSettings;
  datasources: DatasourceType[];
  customServiceEntities: Set<string>;
};

const docFlags = (style: CommentStyle) => ({
  simpleDoc: style === "simple",
  descriptionDoc: style === "description",
});

const segmentTailSnake = (descriptor: NestedRouteDescriptor): string =>
  descriptor.segmentTail.replace(/-/g, "_");

const nestedStem = (descriptor: NestedRouteDescriptor): string =>
  `nested_${descriptor.parent}_${segmentTailSnake(descriptor)}`;

export const nestedRouteEntity = (
  descriptor: NestedRouteDescriptor,
): string => {
  const parts = nestedStem(descriptor).split("_");
  parts[parts.length - 1] = pluralize.singular(parts[parts.length - 1]!);
  return parts.join("_");
};

export const nestedRouterFnName = (
  descriptor: NestedRouteDescriptor,
): string => camelCase(`${nestedStem(descriptor)}_router`);

/** Nested-router filename stem using file-name casing (default kebab). */
export const nestedRouterFileBase = (
  descriptor: NestedRouteDescriptor,
  fileFormat: string = "Kebab",
): string => {
  const stem = nestedStem(descriptor);
  const fmt = fileFormat.toLowerCase();
  if (fmt === "camel") return camelCase(stem);
  if (fmt === "pascal") return camelCase(stem).replace(/^[a-z]/, (c) => c.toUpperCase());
  if (fmt === "snake") return stem;
  return stem.replace(/_/g, "-");
};

export const descriptorFileFormat = (
  options: { fileFormat?: string } = {},
): string => options.fileFormat ?? "Kebab";

export const nestedMountPath = (descriptor: NestedRouteDescriptor): string =>
  descriptor.parentBasePath.replace(`/:${descriptor.parentParam}`, "");

const parentPrimaryKey = (
  parent: string,
  opts: NestedEmitOptions,
): { column: string; idType: string } => {
  const ds = opts.datasources.find((d) => d.name === parent);
  const pk = ds?.fields.find((f) => f.isPrimaryKey);
  return {
    column: pk?.name ?? "id",
    idType: pk?.type === "uuid" ? "uuid" : opts.ds.idType,
  };
};

const serviceIface = (entity: string, naming: RouteNaming): string =>
  `I${naming.className(entity)}Service`;

const isCustomService = (
  entity: string,
  customServiceEntities: Set<string>,
): boolean => customServiceEntities.has(kebabCase(entity));

const renderDirectFk = (
  descriptor: DirectFkDescriptor,
  opts: NestedEmitOptions,
): GenerateEntry => {
  const { naming, style, libraryReferenceMode, customServiceEntities } = opts;
  const fromEntity = nestedRouteEntity(descriptor);
  const fileBase = naming.nestedFileBase(nestedStem(descriptor));
  const filename = naming.nestedFilePath(fromEntity, fileBase);
  const projectRel = naming.byFeature
    ? filename
    : `routes/generated/${fileBase}.ts`;
  const routesImport = libraryImportSpecifier(
    "routes",
    libraryReferenceMode,
    projectRel,
  );
  const repositoriesImport = libraryImportSpecifier(
    "repositories",
    libraryReferenceMode,
    projectRel,
  );
  const child = descriptor.child.name;
  const pk = parentPrimaryKey(descriptor.parent, opts);
  const fnName = nestedRouterFnName(descriptor);
  return content(
    filename,
    fill(directFkTmpl, {
      ...docFlags(style),
      fnName,
      mountPath: nestedMountPath(descriptor),
      routesImport,
      repositoriesImport,
      childServiceIface: serviceIface(child, naming),
      childServiceImport: naming.serviceImport(
        fromEntity,
        child,
        isCustomService(child, customServiceEntities),
      ),
      createSchema: `create${naming.className(child)}Schema`,
      updateSchema: `update${naming.className(child)}Schema`,
      validatorImport: naming.validatorImport(fromEntity, child),
      parentParam: descriptor.parentParam,
      segment: descriptor.segment,
      fkColumn: descriptor.fkColumn,
      parentPascal: naming.className(descriptor.parent),
      childPascal: naming.className(child),
      pkColumnJson: JSON.stringify(pk.column),
      pkIdTypeJson: JSON.stringify(pk.idType),
    }),
  );
};

const renderM2m = (
  descriptor: M2mDescriptor,
  opts: NestedEmitOptions,
): GenerateEntry => {
  const { naming, style, libraryReferenceMode, customServiceEntities } = opts;
  const fromEntity = nestedRouteEntity(descriptor);
  const fileBase = naming.nestedFileBase(nestedStem(descriptor));
  const filename = naming.nestedFilePath(fromEntity, fileBase);
  const projectRel = naming.byFeature
    ? filename
    : `routes/generated/${fileBase}.ts`;
  const routesImport = libraryImportSpecifier(
    "routes",
    libraryReferenceMode,
    projectRel,
  );
  const fnName = nestedRouterFnName(descriptor);
  const custom = (entity: string) =>
    isCustomService(entity, customServiceEntities);
  return content(
    filename,
    fill(m2mTmpl, {
      ...docFlags(style),
      fnName,
      mountPath: nestedMountPath(descriptor),
      routesImport,
      parentServiceIface: serviceIface(descriptor.parent, naming),
      parentServiceImport: naming.serviceImport(
        fromEntity,
        descriptor.parent,
        custom(descriptor.parent),
      ),
      junctionServiceIface: serviceIface(descriptor.junction, naming),
      junctionServiceImport: naming.serviceImport(
        fromEntity,
        descriptor.junction,
        custom(descriptor.junction),
      ),
      targetServiceIface: serviceIface(descriptor.target, naming),
      targetServiceImport: naming.serviceImport(
        fromEntity,
        descriptor.target,
        custom(descriptor.target),
      ),
      parentParam: descriptor.parentParam,
      parentPascal: naming.className(descriptor.parent),
      targetParam: descriptor.targetParam,
      targetPascal: naming.className(descriptor.target),
      segmentTail: descriptor.segmentTail,
      parentFkField: descriptor.parentFkField,
      childFkField: descriptor.childFkField,
    }),
  );
};

export const renderNestedRoutes = (
  nested: NestedRouteDescriptor[],
  opts: NestedEmitOptions,
): GenerateEntry[] =>
  nested.map((d) =>
    d.kind === "direct-fk" ? renderDirectFk(d, opts) : renderM2m(d, opts),
  );
