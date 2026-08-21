import { readdir } from 'node:fs/promises';

const LEGACY_PATTERN = /^V(\d+)__(.+)\.sql$/;
const NEW_PATTERN = /^(\d+)_(.+)_up\.sql$/;

export interface MigrationFile {
  file: string;
  version: string;
  sortKey: number;
}

export async function collectMigrationFiles(dir: string): Promise<MigrationFile[]> {
  const out: MigrationFile[] = [];
  for (const file of await readdir(dir)) {
    const legacy = LEGACY_PATTERN.exec(file);
    if (legacy) {
      out.push({
        file,
        version: `V${legacy[1]}`,
        sortKey: parseInt(legacy[1], 10),
      });
      continue;
    }
    const next = NEW_PATTERN.exec(file);
    if (next) {
      out.push({
        file,
        version: `${next[1]}_${next[2]}`,
        sortKey: parseInt(next[1], 10),
      });
    }
  }
  return out.sort((a, b) => a.sortKey - b.sortKey);
}
