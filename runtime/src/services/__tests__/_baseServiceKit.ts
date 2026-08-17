import type { ICrudRepository } from '../../repositories/ICrudRepository';
import { BaseService } from '../BaseService';
import { createMockCrudRepository } from './mockCrudRepository';

export interface TestEntity {
  id: number;
  uuid: string;
  created: string;
  updated: string;
  name: string;
}

export const TS = '2026-01-01T00:00:00Z';

/** A fresh integer-PK {@link BaseService} over a mock CRUD repository — the shared per-test setup for the BaseService suites. */
export function makeBaseService(): {
  repository: jest.Mocked<ICrudRepository<TestEntity>>;
  service: BaseService<TestEntity>;
} {
  const repository = createMockCrudRepository<TestEntity>('integer');
  const service = new BaseService<TestEntity>(repository);
  return { repository, service };
}
