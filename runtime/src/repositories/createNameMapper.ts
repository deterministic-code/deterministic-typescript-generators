import type { ITypeFieldConverter } from '../converters/ITypeFieldConverter';
import { getMappedTableName } from './getMappedTableName';
import { parseAllMappings, getEntityFieldMap, type EntityFieldMap } from './parseFieldMappings';

export interface NameMapper {
  tableFor(entityName: string): string;
  fieldsFor(entityName: string): EntityFieldMap;
  convertersFor(entityName: string): EntityFieldMap;
}

export function createNameMapper(spec: unknown, pluralizeTableNames = false): NameMapper {
  const { renames, converters } = parseAllMappings(spec);
  return {
    tableFor: (entityName) => getMappedTableName(spec, entityName, pluralizeTableNames),
    fieldsFor: (entityName) => getEntityFieldMap(renames, entityName),
    convertersFor: (entityName) => getEntityFieldMap(converters, entityName),
  };
}

export function resolveFieldConverters(
  converterNames: EntityFieldMap,
  customConverters: ReadonlyMap<string, ITypeFieldConverter> | undefined,
  entityName: string,
): ReadonlyMap<string, ITypeFieldConverter> | undefined {
  if (converterNames.size === 0) return undefined;
  const resolved = new Map<string, ITypeFieldConverter>();
  for (const [column, name] of converterNames) {
    const converter = customConverters?.get(name);
    if (!converter) {
      throw new Error(
        `resolveFieldConverters: entity '${entityName}' field '${column}' declares type_converter '${name}', but no converter with that name was supplied via customConverters`,
      );
    }
    resolved.set(column, converter);
  }
  return resolved;
}
