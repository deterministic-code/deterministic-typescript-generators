import { posix } from "node:path";

const NPM_PACKAGE = "@deterministic-code/deterministic";

/** Join a base dir and file into an import specifier, normalizing a trailing slash and the `.` base to `./`. */
export function joinImport(base: string, file: string): string {
  if (base === ".") return `./${file}`;
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}${file}`;
}

/** Resolve the import specifier for the deterministic library at `subpath` (e.g. "services" | "routes" | "types" | "app"; "" is the package root). `mode` undefined is treated as "npm"; only "bundled" redirects to the vendored `_deterministic/…js` relative to `generatedFileRelToProjectRoot`. */
export function libraryImportSpecifier(
  subpath: string,
  mode: string | undefined,
  generatedFileRelToProjectRoot: string,
): string {
  if (mode !== "bundled") {
    return subpath ? `${NPM_PACKAGE}/${subpath}` : NPM_PACKAGE;
  }
  const dir = posix.dirname(generatedFileRelToProjectRoot);
  let rel = posix.relative(dir, "_deterministic");
  if (!rel) rel = ".";
  if (!rel.startsWith(".")) rel = `./${rel}`;
  // why explicit .js for bundled: tsc with moduleResolution=bundler preserves the import string verbatim into the compiled JS; Node ESM at runtime requires an explicit extension or a package.json exports map — bundled `_deterministic/` ships neither, so the extension goes on at generate-time. Missing it triggered ERR_MODULE_NOT_FOUND on `/app/dist/_deterministic/app` even after PR #1122's runtime-stage COPY landed.
  return subpath ? `${rel}/${subpath}.js` : `${rel}/index.js`;
}

const LIBRARY_IMPORT_RE = new RegExp(
  `(["'])${NPM_PACKAGE.replace(/[/\\]/g, "\\$&")}(?:/([\\w./-]+))?\\1`,
  "g",
);

/** Rewrite every quoted `@deterministic-code/deterministic[/subpath]` specifier in raw template source to the mode-appropriate one for the file it lands at. A genuine no-op in npm/registry mode (returns the same bare specifier); in bundled mode redirects each to the vendored `_deterministic/…js` relative path. Only quoted specifiers match, so a backtick reference inside a comment is left alone. */
export function rewriteLibraryImports(
  source: string,
  mode: string | undefined,
  generatedFileRelToProjectRoot: string,
): string {
  return source.replace(
    LIBRARY_IMPORT_RE,
    (_match: string, quote: string, subpath: string | undefined) =>
      `${quote}${libraryImportSpecifier(subpath ?? "", mode, generatedFileRelToProjectRoot)}${quote}`,
  );
}
