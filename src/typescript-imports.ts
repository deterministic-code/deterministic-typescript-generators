import { libraryImportSpecifier } from "./library-import.ts";
import type { CodegenLayout } from "./sdk/codegen-layout.ts";

type GroupedImportEntry = {
  fromPath: string;
  original: string;
  alias?: string;
};

const renderGroupedImports = (
  entries: GroupedImportEntry[],
  { typeOnly = false }: { typeOnly?: boolean } = {},
): string => {
  const byPath = new Map<string, string[]>();
  for (const e of entries) {
    if (!byPath.has(e.fromPath)) byPath.set(e.fromPath, []);
    const token = e.alias ? `${e.original} as ${e.alias}` : e.original;
    byPath.get(e.fromPath)!.push(token);
  }
  const keyword = typeOnly ? "import type" : "import";
  const lines: string[] = [];
  for (const [path, tokens] of byPath) {
    const names = [...new Set(tokens)].sort().join(", ");
    lines.push(`${keyword} { ${names} } from "${path}";`);
  }
  return lines.sort().join("\n");
};

interface ArtifactRef {
  entity: string;
  artifact: string;
}

interface TypescriptImportsCtx {
  layout: Pick<CodegenLayout, "srcPath" | "importSpecifier">;
}

/** The TypeScript lane's import renderer, injected into an generator as `ctx.imports`. Owns the three TS import mechanics: importing from the runtime library, cross-artifact relative specifiers, and rendering grouped `import { ... }` statements. */
export class TypescriptImports {
  ctx: TypescriptImportsCtx;

  constructor(ctx: TypescriptImportsCtx) {
    this.ctx = ctx;
  }

  /** Specifier for importing `subpath` from the deterministic runtime library, relative to the generated `from` file (`{ entity, artifact }`). */
  library(
    subpath: string,
    mode: string | undefined,
    from: ArtifactRef,
  ): string {
    return libraryImportSpecifier(
      subpath,
      mode,
      this.ctx.layout.srcPath(from.entity, from.artifact),
    );
  }

  /** Relative specifier from `from`'s file to another generated artifact's file. */
  crossArtifact(from: ArtifactRef, to: ArtifactRef): string {
    return this.ctx.layout.importSpecifier(from, to);
  }

  /** Render import intents `{ original, alias, fromPath }` into deduped, sorted import lines. */
  render(
    entries: GroupedImportEntry[],
    { typeOnly = true }: { typeOnly?: boolean } = {},
  ): string {
    return renderGroupedImports(entries, { typeOnly });
  }
}
