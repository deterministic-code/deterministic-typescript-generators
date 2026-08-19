import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";

type PatchMergerModule = typeof import("../node_modules/@deterministic-code/patch-merger/typescript/src/patch-merger.ts");

const mergerSrc = fileURLToPath(
  new URL(
    "../node_modules/@deterministic-code/patch-merger/typescript/src",
    import.meta.url,
  ),
);

const loadPatchMerger = async (rootDir: string): Promise<PatchMergerModule> => {
  // Node will not strip types under node_modules; copy the writer sources
  // under the app dir so rm(appDir) also removes them.
  const dir = join(rootDir, ".patch-merger-src");
  await cp(mergerSrc, dir, { recursive: true });
  return import(
    pathToFileURL(join(dir, "patch-merger.ts")).href
  ) as Promise<PatchMergerModule>;
};

export const writeGenerateEntries = async (
  rootDir: string,
  entries: GenerateEntry[],
): Promise<void> => {
  const { PatchMerger, PatchEntry } = await loadPatchMerger(rootDir);
  const merger = new PatchMerger();
  for (const entry of entries) {
    if (entry.kind === "content") {
      const path = join(rootDir, entry.filename);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, entry.contents, "utf8");
      continue;
    }
    merger.register(
      entry.section === undefined
        ? new PatchEntry({ target: entry.filename, content: entry.content })
        : new PatchEntry({
            target: entry.filename,
            content: entry.content,
            section: entry.section,
          }),
    );
  }
  await merger.apply(rootDir);
};
