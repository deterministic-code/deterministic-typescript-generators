import { PrimaryKey } from './PrimaryKey';
import type { StandardIdType } from './standardFieldConverting';
import type { IPrimaryKeyService } from './IPrimaryKeyService';

/**
 * One entry per entity, fully resolved by the settings loader
 * (`parseCrudRouteSpecs`): the column (declared custom PK, else implicit `id`)
 * and its id_type (the custom PK's own type, else the project id_type from
 * settings). No literal defaults live here — both fields arrive already resolved.
 */
export interface PrimaryKeyRegistration {
  entityName: string;
  primaryKeyColumn: string;
  primaryKeyIdType: StandardIdType;
}

export class PrimaryKeyService implements IPrimaryKeyService {
  private readonly byEntity: Map<string, PrimaryKey>;

  constructor(registrations: readonly PrimaryKeyRegistration[]) {
    this.byEntity = new Map(
      registrations.map((r) => [
        r.entityName,
        new PrimaryKey(r.primaryKeyColumn, r.primaryKeyIdType),
      ]),
    );
  }

  forEntity(entityName: string): PrimaryKey {
    const pk = this.byEntity.get(entityName);
    if (!pk) {
      throw new Error(`invariant: no primary key registered for entity "${entityName}"`);
    }
    return pk;
  }
}
