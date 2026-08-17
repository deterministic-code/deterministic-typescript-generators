import { IStandardCrudService } from '../interfaces/IStandardCrudService';
import { PrimaryKey } from '../../repositories/PrimaryKey';
import type { StandardIdType } from '../../repositories/standardFieldConverting';

type MockableRow = { id: number | string; uuid: string; created: string; updated: string };

/** A fully-stubbed {@link IStandardCrudService} mock for router/service tests — every method is a `jest.fn()`, with `findAll`/`findBy` pre-resolved to `[]` so unconfigured list/lookup calls don't reject. `idType` is explicit (no default) so a fixture states the key shape it intends; `column` defaults to the structural `id`. Shared so the stub lives one place. */
export function createMockCrudService<T extends MockableRow>(
  idType: StandardIdType,
  column = 'id',
): jest.Mocked<IStandardCrudService<T>> {
  return {
    primaryKey: new PrimaryKey(column, idType),
    query: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findBy: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    updateBy: jest.fn(),
    deleteBy: jest.fn(),
  };
}
