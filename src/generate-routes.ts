import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  ROUTES_YAML,
  type CustomRouteEntry,
  type RouteByField,
  type RouteCandidate,
} from "@deterministic-code/generators-common/specification";
import { libraryImportSpecifier } from "./library-import.ts";
import { Emit } from "./emit.ts";
import {
  byFieldDeleteListTmpl,
  byFieldDeleteUniqueTmpl,
  byFieldGetListTmpl,
  byFieldGetUniqueTmpl,
  byFieldPutListTmpl,
  byFieldPutUniqueTmpl,
  crudTmpl,
  customStubTmpl,
  indexTmpl,
  readonlyTmpl,
} from "./resources/routes.ts";

const methodsOf = (entry: RouteByField, fallback: string[]): string[] =>
  Array.isArray(entry.methods) ? entry.methods : fallback;

const BY_FIELD_TMPLS = {
  GET: { unique: byFieldGetUniqueTmpl, list: byFieldGetListTmpl },
  PUT: { unique: byFieldPutUniqueTmpl, list: byFieldPutListTmpl },
  DELETE: { unique: byFieldDeleteUniqueTmpl, list: byFieldDeleteListTmpl },
} as const;

const byFieldsBlock = (entity: string, entries: RouteByField[]): string =>
  entries
    .map((entry) => {
      const methods = methodsOf(entry, ["GET", "PUT", "DELETE"]);
      const tokens = { entity, byField: entry.byField };
      const kind = entry.byFieldUnique ? "unique" : "list";
      return (["GET", "PUT", "DELETE"] as const)
        .filter((method) => methods.includes(method))
        .map((method) => fill(BY_FIELD_TMPLS[method][kind], tokens).trimEnd())
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

const byFieldsNeedsZod = (entries: RouteByField[]): boolean =>
  entries.some((e) => methodsOf(e, ["GET", "PUT", "DELETE"]).includes("PUT"));

const customRouteMeta = (entry: CustomRouteEntry) => {
  const className = entry.routeClass || entry.name;
  return { module: entry.module, className, interfaceName: `I${className}` };
};

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    const parsed = deterministic.routes;
    const customServices = new Set(
      deterministic.services.customs.map((entry) => entry.name),
    );
    const entries: GenerateEntry[] = [
      ...parsed.candidates.map((c) => this.entityRouter(c, customServices)),
      ...parsed.customs.map((c) => this.custom(c)),
    ];
    if (this.settings.createIndex) {
      entries.push(...this.indexes(parsed.candidates, parsed.customs));
    }
    return entries;
  }

  private libImports(entity: string, customService: boolean) {
    const projectRel = this.imports.routeRel(entity);
    const serviceRel = customService
      ? this.imports.serviceCustomRel(entity)
      : this.imports.serviceRel(entity);
    const mode = this.settings.libraryReferenceMode;
    return {
      serviceImport: this.imports.spec(projectRel, serviceRel),
      routesImport: libraryImportSpecifier("routes", mode, projectRel),
      responsesImport: libraryImportSpecifier("responses", mode, projectRel),
      errorsImport: libraryImportSpecifier("errors", mode, projectRel),
    };
  }

  private entityRouter(
    candidate: RouteCandidate,
    customServices: Set<string>,
  ): GenerateEntry {
    const { simpleDoc, descriptionDoc } = this.settings;
    const entity = candidate.name;
    const occ = this.settings.usesOptimisticConcurrency(candidate);
    const readOnly = candidate.datasourceType === "readonly-lookup";
    const byFields = readOnly
      ? candidate.byFields.map((e) => ({
          ...e,
          methods: methodsOf(e, ["GET"]).filter((m) => m === "GET"),
        }))
      : candidate.byFields;
    return content(
      this.imports.route(entity),
      fill(readOnly ? readonlyTmpl : crudTmpl, {
        simpleDoc,
        descriptionDoc,
        ...this.libImports(entity, customServices.has(entity)),
        entity,
        fnName: this.casing.convertTypes(`${entity}_router`),
        datasourceType:
          candidate.datasourceType || (readOnly ? "readonly-lookup" : "standard"),
        occ,
        needsZod: byFieldsNeedsZod(byFields),
        hasByFields: byFields.length > 0,
        byFieldsBlock: byFieldsBlock(entity, byFields),
      }),
    );
  }

  private custom(entry: CustomRouteEntry): GenerateEntry {
    const { simpleDoc, descriptionDoc } = this.settings;
    const { module, className, interfaceName } = customRouteMeta(entry);
    return content(
      this.imports.routeCustom(entry.name, module),
      fill(customStubTmpl, {
        simpleDoc,
        descriptionDoc,
        interfaceName,
        className,
      }),
    );
  }

  private indexes(
    candidates: RouteCandidate[],
    customs: CustomRouteEntry[],
  ): GenerateEntry[] {
    const entries: GenerateEntry[] = [];
    if (candidates.length > 0) {
      const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
      const index = this.imports.index(this.imports.route(sorted[0]!.name));
      if (index) {
        entries.push(
          content(
            index,
            fill(indexTmpl, {
              routers: sorted.map((c) => ({
                fnName: this.casing.convertTypes(`${c.name}_router`),
                fileBase: this.casing.fileBase(c.name),
              })),
            }),
          ),
        );
      }
    }
    const customDir = customs.filter((e) => {
      const { module } = customRouteMeta(e);
      return module === undefined || !module.startsWith(".");
    });
    if (customDir.length > 0) {
      const sorted = [...customDir].sort((a, b) => a.name.localeCompare(b.name));
      const index = this.imports.index(this.imports.routeCustom(sorted[0]!.name));
      if (index) {
        entries.push(
          content(
            index,
            fill(indexTmpl, {
              types: sorted.map((e) => {
                const { className } = customRouteMeta(e);
                return { className, fileBase: `${e.name}_route` };
              }),
            }),
          ),
        );
      }
    }
    return entries;
  }
}

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(ROUTES_YAML);
  return new Generator(ctx.settings).from(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
  );
};
