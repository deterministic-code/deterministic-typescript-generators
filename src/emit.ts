import {
  fromSettings,
  type ISettings,
} from "@deterministic-code/generators-common/settings";
import { createCasing, type PackCasing } from "./common/default-casing.ts";
import {
  createImportGenerator,
  type TypeScriptImportGenerator,
} from "./import-generator.ts";

/** Settings plus pack import generators created once; lanes use `this.imports`. */
export class Emit {
  readonly settings: ISettings;
  readonly casing: PackCasing;
  readonly imports: TypeScriptImportGenerator;
  readonly datasourceImports: TypeScriptImportGenerator;

  constructor(
    raw: Record<string, string>,
    basePath = ".",
    datasourceBasePath?: string,
  ) {
    this.settings = fromSettings(raw);
    this.casing = createCasing(raw);
    this.imports = createImportGenerator(basePath, raw);
    this.datasourceImports = createImportGenerator(
      datasourceBasePath ?? ".",
      raw,
    );
  }
}
