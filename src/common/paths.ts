import { posix } from "node:path";

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const VARIANT_PREFIXES = ["update_", "create_"] as const;

const ident = (name: string): string =>
  IDENT_RE.test(name) ? name : JSON.stringify(name);

export const importSpec = (fromFile: string, toFile: string): string => {
  const toNoExt = toFile.endsWith(".ts") ? toFile.slice(0, -3) : toFile;
  const rel = posix.relative(posix.dirname(fromFile), toNoExt);
  return rel.startsWith(".") ? rel : `./${rel}`;
};

/** Strip `.` / leading `..` from a YAML `module:` path so the remainder is project-relative. */
export const modulePathParts = (mod: string): string[] => {
  const parts = mod.split("/").filter((p) => p !== "" && p !== ".");
  while (parts.length && parts[0] === "..") parts.shift();
  return parts;
};

const variantPrefix = (entity: string): string | undefined =>
  VARIANT_PREFIXES.find((p) => entity.startsWith(p));

const featureEntity = (entity: string): string => {
  const prefix = variantPrefix(entity);
  return prefix === undefined ? entity : entity.slice(prefix.length);
};

const organizeByFeature = (settings: Record<string, string>): boolean =>
  settings["other.organize_by_feature"] === "true";

export type ArtifactPaths = {
  byFeature: boolean;
  className: (entity: string) => string;
  fileBase: (entity: string) => string;
  fieldName: (field: string) => string;
  fieldIdent: (field: string) => string;
  filePath: (entity: string) => string;
  projectRelPath: (entity: string) => string;
};

type TestLayout = {
  indexPath: string;
  testPath: (entity: string) => string;
  testImport: (entity: string) => string;
};

export type ViewPaths = ArtifactPaths &
  TestLayout & {
    importSpecifier: (
      fromEntity: string,
      to: { entity: string; kind: "view" | "datasource" },
    ) => string;
  };

export type ViewValidatorPaths = ArtifactPaths &
  TestLayout & {
    importSpecifier: (
      fromEntity: string,
      to: {
        entity: string;
        kind: "view-validator" | "datasource-validator";
      },
    ) => string;
  };

export type ServicePaths = ArtifactPaths & {
  serviceClassName: (entity: string) => string;
  finderMethod: (field: string) => string;
  casedFileStem: (stem: string) => string;
  customStubPath: (className: string) => string;
  customProjectRelPath: (entity: string) => string;
  testPath: (entity: string) => string;
  importSpecifier: (
    fromEntity: string,
    to: { entity: string; kind: "view" | "datasource" },
  ) => string;
};

export type RoutePaths = ArtifactPaths & {
  testPath: (entity: string) => string;
  customStubPath: (name: string) => string;
};

const core = (
  byFeature: boolean,
  fileBase: (entity: string) => string,
): Pick<
  ArtifactPaths,
  "byFeature" | "className" | "fileBase" | "fieldName" | "fieldIdent"
> => ({
  byFeature,
  className: (entity) => entity,
  fileBase,
  fieldName: (field) => field,
  fieldIdent: ident,
});

export const datasourcePaths = (settings: Record<string, string>): ArtifactPaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature ? `features/${entity}/${file}` : file;
  };
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: (entity) =>
      byFeature ? filePath(entity) : `types/generated/datasource/${filePath(entity)}`,
  };
};

export const viewPaths = (settings: Record<string, string>): ViewPaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature
      ? `features/${featureEntity(entity)}/${file}`
      : file;
  };
  const viewSrc = (entity: string) =>
    byFeature ? filePath(entity) : `types/generated/views/${filePath(entity)}`;
  const dsSrc = (entity: string) =>
    byFeature
      ? `features/${entity}/${entity}.ts`
      : `types/generated/datasource/${entity}.ts`;
  const testPath = (entity: string) => {
    const file = `${fileBase(entity)}.test.ts`;
    return byFeature
      ? `features/${featureEntity(entity)}/__tests__/${file}`
      : file;
  };
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: viewSrc,
    indexPath: "index.ts",
    testPath,
    testImport: (entity) =>
      byFeature
        ? importSpec(testPath(entity), filePath(entity))
        : `../${fileBase(entity)}`,
    importSpecifier: (from, to) =>
      importSpec(
        viewSrc(from),
        to.kind === "view" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const viewValidatorPaths = (
  settings: Record<string, string>,
): ViewValidatorPaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) =>
    byFeature
      ? `features/${featureEntity(entity)}/${fileBase(entity)}.validator.ts`
      : `${fileBase(entity)}.ts`;
  const viewSrc = (entity: string) =>
    byFeature
      ? filePath(entity)
      : `types/generated/views/validators/${filePath(entity)}`;
  const dsSrc = (entity: string) =>
    byFeature
      ? `features/${entity}/${entity}.validator.ts`
      : `types/generated/datasource/validators/${entity}.ts`;
  const testPath = (entity: string) => {
    const file = `${fileBase(entity)}.test.ts`;
    return byFeature
      ? `features/${featureEntity(entity)}/__tests__/${file}`
      : file;
  };
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: viewSrc,
    indexPath: "index.ts",
    testPath,
    testImport: (entity) =>
      byFeature
        ? importSpec(testPath(entity), filePath(entity))
        : `../${fileBase(entity)}`,
    importSpecifier: (from, to) =>
      importSpec(
        viewSrc(from),
        to.kind === "view-validator" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const servicePaths = (settings: Record<string, string>): ServicePaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => `${entity}_service`;
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature ? `features/${entity}/${file}` : file;
  };
  const serviceSrc = (entity: string) =>
    byFeature ? filePath(entity) : `services/generated/${filePath(entity)}`;
  const viewSrc = (entity: string) =>
    byFeature
      ? `features/${featureEntity(entity)}/${entity}.ts`
      : `types/generated/views/${entity}.ts`;
  const dsSrc = (entity: string) =>
    byFeature
      ? `features/${entity}/${entity}.ts`
      : `types/generated/datasource/${entity}.ts`;
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: serviceSrc,
    serviceClassName: (entity) => `${entity}_service`,
    finderMethod: (field) => `find_by_${field}`,
    casedFileStem: (stem) => stem,
    customStubPath: (className) =>
      `features/${className}/custom/${className}.ts`,
    customProjectRelPath: (entity) =>
      byFeature
        ? `features/${entity}/custom/${fileBase(entity)}.ts`
        : `services/custom/${fileBase(entity)}.ts`,
    testPath: (entity) => {
      const file = `${fileBase(entity)}.test.ts`;
      return byFeature
        ? `features/${entity}/__tests__/${file}`
        : file;
    },
    importSpecifier: (from, to) =>
      importSpec(
        serviceSrc(from),
        to.kind === "view" ? viewSrc(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const routePaths = (settings: Record<string, string>): RoutePaths => {
  const byFeature = organizeByFeature(settings);
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) => {
    const file = `${fileBase(entity)}.ts`;
    return byFeature ? `features/${entity}/${file}` : file;
  };
  const routeSrc = (entity: string) =>
    byFeature ? filePath(entity) : `routes/generated/${filePath(entity)}`;
  return {
    ...core(byFeature, fileBase),
    filePath,
    projectRelPath: routeSrc,
    testPath: (entity) => {
      const file = `${fileBase(entity)}.integration.test.ts`;
      return byFeature ? `features/${entity}/__tests__/${file}` : file;
    },
    customStubPath: (name) =>
      byFeature
        ? `features/${name}/custom/${name}_route.ts`
        : `../custom/${name}_route.ts`,
  };
};

export const frontendViewPaths = (
  _settings: Record<string, string>,
  referenceBackendType: boolean,
): ViewPaths => {
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) => `frontend/src/types/${fileBase(entity)}.ts`;
  const testPath = (entity: string) =>
    `frontend/src/types/${fileBase(entity)}.test.ts`;
  const dsSrc = (entity: string) =>
    referenceBackendType
      ? `types/generated/datasource/${entity}.ts`
      : filePath(entity);
  return {
    ...core(false, fileBase),
    filePath,
    projectRelPath: filePath,
    indexPath: "frontend/src/types/index.ts",
    testPath,
    testImport: (entity) => importSpec(testPath(entity), filePath(entity)),
    importSpecifier: (from, to) =>
      importSpec(
        filePath(from),
        to.kind === "view" ? filePath(to.entity) : dsSrc(to.entity),
      ),
  };
};

export const frontendViewValidatorPaths = (
  _settings: Record<string, string>,
  referenceBackendType: boolean,
): ViewValidatorPaths => {
  const fileBase = (entity: string) => entity;
  const filePath = (entity: string) =>
    `frontend/src/validators/${fileBase(entity)}.ts`;
  const testPath = (entity: string) =>
    `frontend/src/validators/${fileBase(entity)}.test.ts`;
  const dsSrc = (entity: string) =>
    referenceBackendType
      ? `types/generated/datasource/validators/${entity}.ts`
      : filePath(entity);
  return {
    ...core(false, fileBase),
    filePath,
    projectRelPath: filePath,
    indexPath: "frontend/src/validators/index.ts",
    testPath,
    testImport: (entity) => importSpec(testPath(entity), filePath(entity)),
    importSpecifier: (from, to) =>
      importSpec(
        filePath(from),
        to.kind === "view-validator" ? filePath(to.entity) : dsSrc(to.entity),
      ),
  };
};

const camelIdent = (name: string): string =>
  name.replace(/_([a-z0-9])/gi, (_, ch: string) => ch.toUpperCase());

/** Map a routes-api path (snake segments, `{param}`) onto TS HTTP paths (kebab segments, camel params). */
export const httpPathFromRoutesApi = (path: string): string =>
  path
    .split("/")
    .map((segment) => {
      const param = /^\{(.+)\}$/.exec(segment);
      return param ? `{${camelIdent(param[1]!)}}` : segment.replace(/_/g, "-");
    })
    .join("/");

export type ClientBindingTransport = "fetch" | "axios" | "tanstack";

export type ClientBindingTransportPaths = {
  indexPath: string;
  httpPath: string;
  filePath: (fileBase: string) => string;
  mockTestPath: (fileBase: string) => string;
  liveTestPath: (fileBase: string) => string;
};

export type ClientBindingPaths = {
  rootIndex: string;
  typeImport: (typeName: string) => string;
  transport: (kind: ClientBindingTransport) => ClientBindingTransportPaths;
};

export const clientBindingPaths = (): ClientBindingPaths => {
  const root = "frontend/src/client";
  return {
    rootIndex: `${root}/index.ts`,
    typeImport: (typeName) => `../../types/${typeName}`,
    transport: (kind) => {
      const dir = `${root}/${kind}`;
      return {
        indexPath: `${dir}/index.ts`,
        httpPath: `${dir}/http.ts`,
        filePath: (fileBase) => `${dir}/${fileBase}.ts`,
        mockTestPath: (fileBase) => `${dir}/${fileBase}.mock.test.ts`,
        liveTestPath: (fileBase) => `${dir}/${fileBase}.live.test.ts`,
      };
    },
  };
};
