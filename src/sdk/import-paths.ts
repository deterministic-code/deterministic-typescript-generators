import { tokenize } from "./case.ts";

const CUSTOM_SUFFIX_TOKENS = new Set(["service", "route"]);

/** Feature-entity derivation and by-feature custom stub paths. */
export class ImportPaths {
  /** The feature-entity a custom class belongs to: HealthCheckService -> "health-check". A bare suffix (Service/Route) stays as-is; callers fall back to a generic location. */
  static featureEntity(className: string): string {
    if (!className || typeof className !== "string") return "";
    const tokens = tokenize(className);
    if (tokens.length === 0) return "";
    const last = tokens[tokens.length - 1];
    if (tokens.length > 1 && CUSTOM_SUFFIX_TOKENS.has(last)) {
      tokens.pop();
    }
    return tokens.join("-");
  }

  /** By-feature stub path: features/<entity>/custom/<fileBase><ext>; bare-suffix names collapse to "shared". snakeDir swaps kebab for rust snake feature dirs. */
  static customStubPath({
    className,
    fileBase,
    ext,
    snakeDir = false,
  }: {
    className: string;
    fileBase: string;
    ext: string;
    snakeDir?: boolean;
  }): string {
    const entity = ImportPaths.featureEntity(className) || "shared";
    const featureDir = snakeDir ? entity.replace(/-/g, "_") : entity;
    return `features/${featureDir}/custom/${fileBase}${ext}`;
  }
}
