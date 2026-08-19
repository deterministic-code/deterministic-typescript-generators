import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const E2E_TEMP_PREFIXES = [
  "ts-backend-app-e2e-",
  "patch-merger-src-",
] as const;

export const removeE2eTempDirs = async (keep?: string): Promise<void> => {
  const root = tmpdir();
  const skip = keep === undefined ? undefined : resolve(keep);
  const names = await readdir(root);
  await Promise.all(
    names
      .filter((name) =>
        E2E_TEMP_PREFIXES.some((prefix) => name.startsWith(prefix)),
      )
      .map((name) => join(root, name))
      .filter((path) => skip === undefined || resolve(path) !== skip)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
};
