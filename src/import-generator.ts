import { posix } from "node:path";
import type { IImportGenerator } from "@deterministic-code/generators-common/import-generator";
import { createCasing, type PackCasing } from "./common/default-casing.ts";

export const FRONTEND_VIEW_DIR = "frontend/src/types";
export const FRONTEND_VIEW_VALIDATOR_DIR = "frontend/src/validators";

const importSpec = (fromFile: string, toFile: string): string => {
  const toNoExt = toFile.endsWith(".ts") ? toFile.slice(0, -3) : toFile;
  const rel = posix.relative(posix.dirname(fromFile), toNoExt);
  return rel.startsWith(".") ? rel : `./${rel}`;
};

const modulePathParts = (mod: string): string[] => {
  const parts = mod.split("/").filter((p) => p !== "" && p !== ".");
  while (parts.length && parts[0] === "..") parts.shift();
  return parts;
};

const featureEntity = (entity: string): string =>
  entity.replace(/^(?:update_|create_)/, "");

export class TypeScriptImportGenerator implements IImportGenerator {
  private readonly organizeByFeature: boolean;
  private readonly flat: boolean;
  private readonly basePath: string;
  private readonly casing: PackCasing;

  constructor(basePath: string, settings: Record<string, string>) {
    this.basePath = basePath;
    this.flat = basePath !== "" && basePath !== ".";
    this.organizeByFeature =
      !this.flat && settings["other.organize_by_feature"] === "true";
    this.casing = createCasing(settings);
  }

  datasource(entity: string): string {
    return this.cased(this.underBase(this.featureFile(entity, entity)), entity);
  }

  datasourceRel(entity: string): string {
    return this.rel("types/generated/datasource", this.datasource(entity));
  }

  datasourceQual(entity: string): string {
    return this.casing.convertTypes(entity);
  }

  datasourceValidator(entity: string): string {
    const file = `${entity}${this.organizeByFeature ? ".validator" : ""}.ts`;
    const path = this.organizeByFeature ? `features/${entity}/${file}` : file;
    return this.underBase(path);
  }

  datasourceValidatorRel(entity: string): string {
    return this.rel(
      "types/generated/datasource/validators",
      this.datasourceValidator(entity),
    );
  }

  view(entity: string): string {
    return this.underBase(this.viewLike(entity, ""));
  }

  viewRel(entity: string): string {
    return this.rel("types/generated/views", this.view(entity));
  }

  viewQual(entity: string): string {
    return entity;
  }

  viewValidator(entity: string): string {
    return this.underBase(this.viewLike(entity, ".validator"));
  }

  viewValidatorRel(entity: string): string {
    return this.rel(
      "types/generated/views/validators",
      this.viewValidator(entity),
    );
  }

  service(entity: string): string {
    return this.underBase(this.featureFile(entity, this.serviceStem(entity)));
  }

  serviceRel(entity: string): string {
    return this.rel("services/generated", this.service(entity));
  }

  serviceCustom(name: string, module?: string): string {
    return this.resolveCustom(name, module, "services");
  }

  serviceCustomRel(entity: string): string {
    const stem = this.serviceStem(entity);
    return this.organizeByFeature
      ? `features/${entity}/custom/${stem}.ts`
      : `services/custom/${stem}.ts`;
  }

  serviceTest(entity: string): string {
    const file = `${this.serviceStem(entity)}.test.ts`;
    const path = this.organizeByFeature
      ? `features/${entity}/__tests__/${file}`
      : file;
    return this.underBase(path);
  }

  serviceTestRel(entity: string): string {
    return this.rel("services/generated/__tests__", this.serviceTest(entity));
  }

  serviceIntegrationTest(entity: string): string {
    return this.serviceTest(entity).replace(/\.test\.ts$/, ".integration.test.ts");
  }

  serviceIntegrationTestRel(entity: string): string {
    return this.rel(
      "services/generated/__tests__",
      this.serviceIntegrationTest(entity),
    );
  }

  serviceUse(_entity: string, _symbol: string): string {
    return "";
  }

  route(entity: string): string {
    return this.underBase(this.featureFile(entity, entity));
  }

  routeRel(entity: string): string {
    return this.rel("routes/generated", this.route(entity));
  }

  routeCustom(name: string, module?: string): string {
    return this.resolveCustom(name, module, "routes");
  }

  routeTest(entity: string): string {
    const file = `${entity}.integration.test.ts`;
    const path = this.organizeByFeature
      ? `features/${entity}/__tests__/${file}`
      : file;
    return this.underBase(path);
  }

  enrichment(_targetTable: string): string {
    return "";
  }

  test(srcFile: string, fileBase: string): string {
    if (this.organizeByFeature) {
      return `${posix.dirname(srcFile)}/__tests__/${fileBase}.test.ts`;
    }
    return srcFile.replace(/\.ts$/, ".test.ts");
  }

  testSpec(srcFile: string, fileBase: string): string {
    if (!srcFile.includes("/")) return `../${fileBase}`;
    return importSpec(this.test(srcFile, fileBase), srcFile);
  }

  index(beside: string): string {
    if (this.organizeByFeature) return "";
    return posix.join(posix.dirname(beside), "index.ts");
  }

  spec(fromFile: string, toFile: string): string {
    return importSpec(fromFile, toFile);
  }

  routeModule(entity: string): string {
    return entity;
  }

  appWiring(): string {
    return "";
  }

  validatorFn(
    _kind: "datasource" | "view",
    _entity: string,
    _fn: string,
  ): string {
    return "";
  }

  apiPath(entity: string): string {
    return entity.replace(/_/g, "-");
  }

  private rel(prefix: string, file: string): string {
    if (this.organizeByFeature || this.flat) return file;
    return `${prefix}/${file}`;
  }

  private cased(laid: string, entity: string): string {
    const identityFile = `${entity}.ts`;
    const casedFile = `${this.casing.fileBase(entity)}.ts`;
    const withFile = laid.endsWith(identityFile)
      ? laid.slice(0, -identityFile.length) + casedFile
      : laid;
    const identityDir = `/${entity}/`;
    const casedDir = `/${this.casing.directory(entity)}/`;
    return withFile.includes(identityDir)
      ? withFile.replace(identityDir, casedDir)
      : withFile;
  }

  private serviceStem(entity: string): string {
    return `${entity}_service`;
  }

  private underBase(file: string): string {
    if (!this.flat) return file;
    return `${this.basePath}/${file}`;
  }

  private featureFile(entity: string, stem: string, dir = entity): string {
    const file = `${stem}.ts`;
    return this.organizeByFeature ? `features/${dir}/${file}` : file;
  }

  private viewLike(entity: string, featureExt: string): string {
    const file = `${entity}${this.organizeByFeature ? featureExt : ""}.ts`;
    return this.organizeByFeature
      ? `features/${featureEntity(entity)}/${file}`
      : file;
  }

  private resolveCustom(
    name: string,
    mod: string | undefined,
    layer: "services" | "routes",
  ): string {
    const kind = layer === "services" ? "service" : "route";
    const stubFn =
      layer === "services"
        ? "generateCustomServiceStub"
        : "generateCustomRouteStub";
    const defaultStub = this.organizeByFeature
      ? layer === "services"
        ? `features/${name}/custom/${name}.ts`
        : `features/${name}/custom/${name}_route.ts`
      : layer === "services"
        ? `../custom/${name}.ts`
        : `../custom/${name}_route.ts`;
    if (this.organizeByFeature) {
      if (
        typeof mod !== "string" ||
        !mod.startsWith(".") ||
        mod.startsWith("./services/") ||
        mod.startsWith("./routes/")
      ) {
        return defaultStub;
      }
      const parts = modulePathParts(mod);
      if (parts[0] !== "features") {
        throw new Error(
          `${stubFn}: ${kind} "${name}" has module "${mod}" which is outside ./features/. ` +
            `When organize=by-feature, custom ${layer} must live under features/<entity>/custom/. ` +
            `Drop the module: field to use the convention default (${defaultStub.replace(/\.ts$/, "")}), ` +
            `or point module: into ./features/.`,
        );
      }
      return `${parts.join("/")}.ts`;
    }
    if (!mod || !mod.startsWith(".")) return defaultStub;
    const parts = modulePathParts(mod);
    if (parts[0] === layer) parts.shift();
    return `../${parts.join("/")}.ts`;
  }
}

export const createImportGenerator = (
  basePath: string,
  settings: Record<string, string>,
): TypeScriptImportGenerator =>
  new TypeScriptImportGenerator(basePath, settings);
