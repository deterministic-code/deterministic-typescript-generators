import type { StandardIdType } from './standardFieldConverting';
import type { RouteIdType } from '../routes/routeParamUtils';

const ID_TYPES: readonly StandardIdType[] = ['integer', 'biginteger', 'uuid', 'string'];

/**
 * The single per-entity source of truth for a primary key: its column name and
 * its {@link StandardIdType}, plus how to address it in a route and read/compare
 * it on a row. Repos, services, and routers all resolve the PK through this
 * (via {@link IPrimaryKeyService}) instead of hardcoding `'id'` / integer.
 *
 * There are NO literal defaults — `column` and `idType` must both be supplied,
 * already resolved from settings + the entity's declared `primary_key`. A
 * missing or invalid value throws at construction so it can never silently
 * degrade to integer `id`. The id_type is resolved once, in the settings loader.
 */
export class PrimaryKey {
  constructor(
    readonly column: string,
    readonly idType: StandardIdType,
  ) {
    if (!column) {
      throw new Error('invariant: PrimaryKey requires a column (from the entity primary_key)');
    }
    if (!ID_TYPES.includes(idType)) {
      throw new Error(
        `invariant: PrimaryKey requires an id_type resolved from settings, got ${JSON.stringify(idType)}`,
      );
    }
  }

  /** The route-level id shape: `biginteger` ids validate as positive integers on the wire, so path parsing treats them as `integer`. */
  get routeIdType(): RouteIdType {
    return this.idType === 'biginteger' ? 'integer' : this.idType;
  }

  /** The Express member segment addressing this key. `paramName` is route-contextual (e.g. `id`, `projectId`) and defaults to the column. */
  routeSegment(paramName: string = this.column): string {
    return `/:${paramName}`;
  }

  /** Read this key's value off a row. */
  valueOf(row: Record<string, unknown>): unknown {
    return row[this.column];
  }

  /** Whether `row` is the one addressed by `id`. */
  matches(row: Record<string, unknown>, id: number | string): boolean {
    return row[this.column] === id;
  }

  /** The Zod body-field type for a foreign key referencing this key: `number` for integer/biginteger keys, `string` for uuid/string keys. */
  bodyFieldType(): 'number' | 'string' {
    return this.routeIdType === 'integer' ? 'number' : 'string';
  }
}
