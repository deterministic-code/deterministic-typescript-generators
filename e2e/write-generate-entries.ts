import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Patch, PatchMerger } from "@deterministic-code/patch-merger";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";

const asPatch = (entry: Extract<GenerateEntry, { kind: "patch" }>): Patch =>
  entry.section === undefined
    ? new Patch({ target: entry.filename, content: entry.content })
    : new Patch({
        target: entry.filename,
        content: entry.content,
        options: { sections: [entry.section] },
      });

export const writeGenerateEntries = async (
  rootDir: string,
  entries: GenerateEntry[],
): Promise<void> => {
  const merger = new PatchMerger();
  const patches: Extract<GenerateEntry, { kind: "patch" }>[] = [];
  for (const entry of entries) {
    if (entry.kind === "content") {
      const path = join(rootDir, entry.filename);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, entry.contents, "utf8");
      continue;
    }
    patches.push(entry);
  }
  const seeded = new Set<string>();
  for (const entry of patches) {
    if (!seeded.has(entry.filename)) {
      seeded.add(entry.filename);
      const existing = await readFile(join(rootDir, entry.filename), "utf8").catch(
        () => null,
      );
      if (existing !== null && existing.length > 0) {
        merger.add(new Patch({ target: entry.filename, content: existing }));
      }
    }
    merger.add(asPatch(entry));
  }
  const written = await merger.apply(rootDir);
  await Promise.all(
    written
      .filter((target) => target.endsWith(".sh"))
      .map((target) => chmod(join(rootDir, target), 0o755)),
  );
};
