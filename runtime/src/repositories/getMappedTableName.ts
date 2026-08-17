import { effectiveTableName } from './effectiveTableName';

export function getMappedTableName(
  spec: unknown,
  entityName: string,
  pluralizeTableNames = false,
): string {
  const explicit = readExplicitMapping(spec, entityName);
  if (explicit !== null) return explicit;
  return effectiveTableName(entityName, pluralizeTableNames);
}

function readExplicitMapping(spec: unknown, entityName: string): string | null {
  if (!spec || typeof spec !== 'object') return null;
  const mappings = (spec as Record<string, unknown>).datasource_mappings;
  if (!Array.isArray(mappings) || mappings.length === 0) return null;
  for (const mapping of mappings) {
    if (!mapping || typeof mapping !== 'object') continue;
    const entry = (mapping as Record<string, unknown>)[entityName];
    if (entry && typeof entry === 'object' && 'source' in entry) {
      const source = (entry as Record<string, unknown>).source;
      if (typeof source === 'string') return source;
    }
  }
  return null;
}
