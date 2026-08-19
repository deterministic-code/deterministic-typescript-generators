import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const removeE2eTempDirs = async (
  prefixes: readonly string[],
  keep?: string,
): Promise<void> => {
  const root = tmpdir();
  const skip = keep === undefined ? undefined : resolve(keep);
  const names = await readdir(root);
  await Promise.all(
    names
      .filter((name) => prefixes.some((prefix) => name.startsWith(prefix)))
      .map((name) => join(root, name))
      .filter((path) => skip === undefined || resolve(path) !== skip)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
};
