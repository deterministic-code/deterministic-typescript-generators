import { patch, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  fromSettings,
  type ISettings,
} from "@deterministic-code/generators-common/settings";
import { createCasing, type PackCasing } from "./common/default-casing.ts";
import {
  createImportGenerator,
  type TypeScriptImportGenerator,
} from "./import-generator.ts";

export type TsconfigIncludeLayer = "services" | "routes" | "types" | "features";

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

  tsconfigIncludePatch(
    layer: TsconfigIncludeLayer,
  ): GenerateEntry | undefined {
    const glob = this.imports.tsconfigInclude(layer);
    if (glob === undefined) return undefined;
    return patch("tsconfig.json", JSON.stringify({ include: [glob] }));
  }

  withTsconfigInclude(
    entries: GenerateEntry[],
    layer: TsconfigIncludeLayer,
  ): GenerateEntry[] {
    if (entries.length === 0) return entries;
    const extra = this.tsconfigIncludePatch(layer);
    return extra === undefined ? entries : [...entries, extra];
  }
}
