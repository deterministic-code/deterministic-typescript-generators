import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Patch, PatchMerger } from "@deterministic-code/patch-merger";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";

export const writeGenerateEntries = async (
  rootDir: string,
  entries: GenerateEntry[],
): Promise<void> => {
  const merger = new PatchMerger();
  for (const entry of entries) {
    if (entry.kind === "content") {
      const path = join(rootDir, entry.filename);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, entry.contents, "utf8");
      continue;
    }
    merger.add(
      entry.section === undefined
        ? new Patch({ target: entry.filename, content: entry.content })
        : new Patch({
            target: entry.filename,
            content: entry.content,
            options: { sections: [entry.section] },
          }),
    );
  }
  const written = await merger.apply(rootDir);
  await Promise.all(
    written
      .filter((target) => target.endsWith(".sh"))
      .map((target) => chmod(join(rootDir, target), 0o755)),
  );
};
