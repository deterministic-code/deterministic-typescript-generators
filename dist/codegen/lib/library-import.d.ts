/** Join a base dir and file into an import specifier, normalizing a trailing slash and the `.` base to `./`. */
export declare function joinImport(base: string, file: string): string;
/** Resolve the import specifier for the deterministic library at `subpath` (e.g. "services" | "routes" | "types" | "app"; "" is the package root). `mode` undefined is treated as "npm"; only "bundled" redirects to the vendored `_deterministic/…js` relative to `emittedFileRelToProjectRoot`. */
export declare function libraryImportSpecifier(subpath: string, mode: string | undefined, emittedFileRelToProjectRoot: string): string;
/** Rewrite every quoted `@deterministic-code/deterministic[/subpath]` specifier in raw template source to the mode-appropriate one for the file it lands at. A genuine no-op in npm/registry mode (returns the same bare specifier); in bundled mode redirects each to the vendored `_deterministic/…js` relative path. Only quoted specifiers match, so a backtick reference inside a comment is left alone. */
export declare function rewriteLibraryImports(source: string, mode: string | undefined, emittedFileRelToProjectRoot: string): string;
