import { PrimaryKey } from '../PrimaryKey';
import type { IPrimaryKeyService } from '../IPrimaryKeyService';
import type { StandardIdType } from '../standardFieldConverting';

/** A stub {@link IPrimaryKeyService} for repo/service/router fixtures: every `forEntity` resolves to one fixed key. `idType` is explicit (no default) so a fixture states the shape it intends; `column` defaults to the structural `id`. */
export function testPrimaryKeys(idType: StandardIdType, column = 'id'): IPrimaryKeyService {
  const pk = new PrimaryKey(column, idType);
  return { forEntity: () => pk };
}
