import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import {
  namedRoutes,
  type RoutesApiBody,
  type RoutesApiDoc,
  type RoutesApiRouteDef,
} from "@deterministic-code/generators-common/routes-api";
import { loadRoutesApi } from "@deterministic-code/generators-common/routes-api-converter";
import { createCasing } from "./common/default-casing.ts";
import { httpPathFromRoutesApi } from "./common/http-path.ts";
import { resolvesToSelf } from "./frontend-bindings-routes.ts";

const camelIdent = (name: string): string =>
  name.replace(/_([a-z0-9])/gi, (_, ch: string) => ch.toUpperCase());

const pascalIdent = (name: string): string => {
  const camel = camelIdent(name);
  return `${camel.slice(0, 1).toUpperCase()}${camel.slice(1)}`;
};

export const clientBindingsSchema = (settings: Record<string, string>): string =>
  settings["client_bindings.schema"] ?? "self";

export const requireSelfSchema = (settings: Record<string, string>): void => {
  const schema = clientBindingsSchema(settings);
  if (!resolvesToSelf(schema)) {
    throw new Error(
      `generate-client-bindings: schema ${JSON.stringify(schema)} is not this backend (expected "self" or "id:...")`,
    );
  }
};

const pathParamNames = (path: string): string[] => {
  const counts = new Map<string, number>();
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => {
    const camel = camelIdent(match[1]!);
    const n = (counts.get(camel) ?? 0) + 1;
    counts.set(camel, n);
    return n === 1 ? camel : `${camel}_${n}`;
  });
};

const pathExpr = (path: string, params: string[]): string => {
  if (params.length === 0) return JSON.stringify(path);
  let i = 0;
  const replaced = path.replace(/\{[^}]+\}/g, () => {
    const name = params[i++]!;
    return `\${encodeURIComponent(String(${name}))}`;
  });
  return `\`${replaced}\``;
};

const methodNameOf = (routeName: string, entity: string | null): string => {
  if (entity === null) return camelIdent(routeName);
  const prefix = camelIdent(entity);
  if (!routeName.startsWith(prefix) || routeName.length === prefix.length) {
    return camelIdent(routeName);
  }
  const rest = routeName.slice(prefix.length);
  return rest[0]!.toLowerCase() + rest.slice(1);
};

const namedType = (typeName: string): string | undefined => {
  if (typeName === "unknown" || typeName === "void") return undefined;
  return typeName.endsWith("[]") ? typeName.slice(0, -2) : typeName;
};

const bodyName = (body: RoutesApiBody | undefined): string | undefined =>
  body === undefined ? undefined : body.name;

export type ClientMethodIr = {
  methodName: string;
  pascalName: string;
  hookName: string;
  httpMethod: string;
  pathPattern: string;
  pathExpr: string;
  params: string[];
  hasArgs: boolean;
  hasBody: boolean;
  hasResponse: boolean;
  isList: boolean;
  isQuery: boolean;
  args: string;
  callArgs: string;
  liveArgs: string;
  liveMutationArg: string;
  mutationArg: string;
  mutationCall: string;
  hasMutationArg: boolean;
  bodyType: string;
  returnType: string;
  mockReturn: string;
  queryKeyExpr: string;
};

export type ClientEntityIr = {
  fileBase: string;
  clientName: string;
  queryOptionsName: string;
  mutationOptionsName: string;
  pascalEntity: string;
  methods: ClientMethodIr[];
  queries: ClientMethodIr[];
  mutations: ClientMethodIr[];
  typeImports: Array<{ typeName: string; importPath: string }>;
};

export type ClientBindingsIr = {
  entities: ClientEntityIr[];
};

const isListPath = (method: string, path: string): boolean =>
  method === "GET" && !/\{[^}]+\}$/.test(path);

const mutationShape = (
  params: string[],
  hasBody: boolean,
  bodyType: string,
): Pick<ClientMethodIr, "mutationArg" | "mutationCall" | "hasMutationArg"> => {
  const fields = [
    ...params.map((name) => `${name}: string | number`),
    ...(hasBody ? [`body: ${bodyType}`] : []),
  ];
  if (fields.length === 0) {
    return { mutationArg: "", mutationCall: "", hasMutationArg: false };
  }
  if (fields.length === 1) {
    return {
      mutationArg: fields[0]!,
      mutationCall: hasBody ? "body" : params[0]!,
      hasMutationArg: true,
    };
  }
  return {
    mutationArg: `vars: { ${fields.join("; ")} }`,
    mutationCall: [
      ...params.map((name) => `vars.${name}`),
      ...(hasBody ? ["vars.body"] : []),
    ].join(", "),
    hasMutationArg: true,
  };
};

const projectMethod = (
  routeName: string,
  def: RoutesApiRouteDef,
): { method: ClientMethodIr; typeNames: string[] } => {
  const pathPattern = httpPathFromRoutesApi(def.path);
  const params = pathParamNames(pathPattern);
  const httpMethod = def.method.toUpperCase();
  const isList = isListPath(httpMethod, pathPattern);
  const requestName = bodyName(def.request);
  const responseName = bodyName(def.response);
  const hasBody = requestName !== undefined;
  const bodyType = requestName ?? "unknown";
  const hasResponse = responseName !== undefined;
  const returnType = !hasResponse
    ? "void"
    : isList
      ? `${responseName}[]`
      : responseName;
  const methodName = methodNameOf(routeName, def.entity);
  const argParts = [
    ...params.map((name) => `${name}: string | number`),
    ...(hasBody ? [`body: ${bodyType}`] : []),
  ];
  const callParts = [...params, ...(hasBody ? ["body"] : [])];
  const liveParts = [...params.map(() => "1"), ...(hasBody ? ["{}"] : [])];
  const typeNames = [namedType(bodyType), namedType(returnType)].filter(
    (name): name is string => name !== undefined,
  );
  const method: ClientMethodIr = {
    methodName,
    pascalName: pascalIdent(methodName),
    hookName: pascalIdent(`use_${def.entity ?? "custom"}_${methodName}`),
    httpMethod,
    pathPattern,
    pathExpr: pathExpr(pathPattern, params),
    params,
    hasArgs: argParts.length > 0,
    hasBody,
    hasResponse,
    isList,
    isQuery: httpMethod === "GET",
    args: argParts.join(", "),
    callArgs: callParts.join(", "),
    liveArgs: liveParts.join(", "),
    liveMutationArg:
      callParts.length === 0
        ? ""
        : callParts.length === 1
          ? liveParts[0]!
          : `{ ${callParts.map((name, i) => `${name}: ${liveParts[i]!}`).join(", ")} }`,
    ...mutationShape(params, hasBody, bodyType),
    bodyType,
    returnType,
    mockReturn: isList ? "[]" : hasResponse ? "{}" : "undefined",
    queryKeyExpr: `[${[JSON.stringify(def.entity ?? "custom"), JSON.stringify(methodName), ...params].join(", ")}] as const`,
  };
  return { method, typeNames };
};

export const projectClientBindings = (
  doc: RoutesApiDoc,
  typeImport: (typeName: string) => string = (typeName) =>
    `../../types/${typeName}`,
): ClientBindingsIr => {
  const grouped = new Map<
    string,
    { fileBase: string; clientName: string; pascalEntity: string; methods: ClientMethodIr[]; typeNames: Set<string> }
  >();
  for (const [routeName, def] of namedRoutes(doc.routes)) {
    const fileBase = def.entity ?? "custom";
    const bucket = grouped.get(fileBase) ?? {
      fileBase,
      clientName: camelIdent(`${fileBase}_client`),
      pascalEntity: pascalIdent(fileBase),
      methods: [],
      typeNames: new Set<string>(),
    };
    if (!grouped.has(fileBase)) grouped.set(fileBase, bucket);
    const projected = projectMethod(routeName, def);
    bucket.methods.push(projected.method);
    for (const name of projected.typeNames) bucket.typeNames.add(name);
  }
  const entities = [...grouped.values()]
    .sort((a, b) => a.fileBase.localeCompare(b.fileBase))
    .map((bucket) => ({
      fileBase: bucket.fileBase,
      clientName: bucket.clientName,
      queryOptionsName: camelIdent(`${bucket.fileBase}_client_query_options`),
      mutationOptionsName: camelIdent(`${bucket.fileBase}_client_mutation_options`),
      pascalEntity: bucket.pascalEntity,
      methods: bucket.methods,
      queries: bucket.methods.filter((method) => method.isQuery),
      mutations: bucket.methods.filter((method) => !method.isQuery),
      typeImports: [...bucket.typeNames]
        .sort((a, b) => a.localeCompare(b))
        .map((typeName) => ({ typeName, importPath: typeImport(typeName) })),
    }));
  return { entities };
};

export const loadClientBindingsIr = async (
  ctx: GenerateContext,
): Promise<ClientBindingsIr> => {
  requireSelfSchema(ctx.settings);
  const ir = projectClientBindings(await loadRoutesApi(ctx));
  const casing = createCasing(ctx.settings);
  return {
    entities: ir.entities.map((entity) => {
      const originalEntity = entity.fileBase;
      const fileBase = casing.fileBase(originalEntity);
      const methods = entity.methods.map((method) => ({
        ...method,
        pascalName: casing.convertTypes(method.methodName),
        hookName: casing.hookName(originalEntity, method.methodName),
      }));
      return {
        ...entity,
        fileBase,
        queryOptionsName: camelIdent(`${originalEntity}_client_query_options`),
        mutationOptionsName: camelIdent(
          `${originalEntity}_client_mutation_options`,
        ),
        pascalEntity: casing.convertTypes(originalEntity),
        methods,
        queries: methods.filter((method) => method.isQuery),
        mutations: methods.filter((method) => !method.isQuery),
      };
    }),
  };
};
