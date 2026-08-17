import { renderGroupedImports } from "@deterministic-code/generator-sdk/generator-shared";
import type { CodegenLayout } from "@deterministic-code/generator-sdk/codegen-layout";
interface ArtifactRef {
    entity: string;
    artifact: string;
}
interface TypescriptImportsCtx {
    layout: Pick<CodegenLayout, "srcPath" | "importSpecifier">;
}
/** The TypeScript lane's import renderer, injected into an generator as `ctx.imports`. Owns the three TS import mechanics: importing from the runtime library, cross-artifact relative specifiers, and rendering grouped `import { ... }` statements. */
export declare class TypescriptImports {
    ctx: TypescriptImportsCtx;
    constructor(ctx: TypescriptImportsCtx);
    /** Specifier for importing `subpath` from the deterministic runtime library, relative to the generated `from` file (`{ entity, artifact }`). */
    library(subpath: string, mode: string | undefined, from: ArtifactRef): string;
    /** Relative specifier from `from`'s file to another generated artifact's file. */
    crossArtifact(from: ArtifactRef, to: ArtifactRef): string;
    /** Render import intents `{ original, alias, fromPath }` into deduped, sorted import lines. */
    render(entries: Parameters<typeof renderGroupedImports>[0], { typeOnly }?: {
        typeOnly?: boolean;
    }): string;
}
export {};
