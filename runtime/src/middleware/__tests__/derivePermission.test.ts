import { derivePermission } from '../authorize';

describe('derivePermission', () => {
  describe('HTTP method to verb mapping', () => {
    it("should map GET to 'read'", () => {
      expect(derivePermission('GET', '/api/projects')).toBe('read:project');
    });

    it("should map POST to 'create'", () => {
      expect(derivePermission('POST', '/api/projects')).toBe('create:project');
    });

    it("should map PUT to 'update'", () => {
      expect(derivePermission('PUT', '/api/projects/1')).toBe('update:project');
    });

    it("should map PATCH to 'update'", () => {
      expect(derivePermission('PATCH', '/api/projects/1')).toBe('update:project');
    });

    it("should map DELETE to 'delete'", () => {
      expect(derivePermission('DELETE', '/api/projects/1')).toBe('delete:project');
    });

    it('should lowercase unknown methods as verb', () => {
      expect(derivePermission('OPTIONS', '/api/projects')).toBe('options:project');
    });
  });

  describe('path to type name extraction', () => {
    it('should extract type from simple plural path', () => {
      expect(derivePermission('GET', '/api/projects')).toBe('read:project');
    });

    it('should extract type from path with ID', () => {
      expect(derivePermission('GET', '/api/projects/42')).toBe('read:project');
    });

    it('should extract type from path with nested resource', () => {
      expect(derivePermission('GET', '/api/users/5/roles')).toBe('read:user');
    });

    it('should extract type from path with nested M2M resource and ID', () => {
      expect(derivePermission('GET', '/api/users/5/roles/3')).toBe('read:user');
    });

    it('should convert kebab-case to snake_case', () => {
      expect(derivePermission('GET', '/api/api-logs')).toBe('read:api_log');
    });

    it('should convert kebab-case with ID to snake_case', () => {
      expect(derivePermission('DELETE', '/api/token-hits/42')).toBe('delete:token_hit');
    });

    it('should convert multi-segment kebab-case', () => {
      expect(derivePermission('GET', '/api/api-log-types')).toBe('read:api_log_type');
    });

    it('should singularize standard plurals (projects → project)', () => {
      expect(derivePermission('GET', '/api/projects')).toBe('read:project');
    });

    it('should singularize -es plurals (caches → cache)', () => {
      expect(derivePermission('GET', '/api/caches')).toBe('read:cache');
    });

    it('should singularize -ies plurals (entries → entry)', () => {
      expect(derivePermission('GET', '/api/entries')).toBe('read:entry');
    });

    it('should handle users path', () => {
      expect(derivePermission('GET', '/api/users')).toBe('read:user');
    });

    it('should handle tokens path', () => {
      expect(derivePermission('POST', '/api/tokens')).toBe('create:token');
    });

    it('should handle services path', () => {
      expect(derivePermission('GET', '/api/services')).toBe('read:service');
    });

    it('should handle scopes path', () => {
      expect(derivePermission('GET', '/api/scopes')).toBe('read:scope');
    });

    it('should handle permissions path', () => {
      expect(derivePermission('GET', '/api/permissions')).toBe('read:permission');
    });

    it('should handle api-quotas path', () => {
      expect(derivePermission('GET', '/api/api-quotas')).toBe('read:api_quota');
    });

    it('should handle scope-permissions path', () => {
      expect(derivePermission('GET', '/api/scope-permissions')).toBe('read:scope_permission');
    });

    it('should handle token-scopes path', () => {
      expect(derivePermission('GET', '/api/token-scopes')).toBe('read:token_scope');
    });

    it('should handle roles path', () => {
      expect(derivePermission('GET', '/api/roles')).toBe('read:role');
    });

    it("should drop 'es' from -sses plurals (classes → class)", () => {
      expect(derivePermission('GET', '/api/classes')).toBe('read:class');
    });

    it("should drop 'es' from -shes plurals (brushes → brush)", () => {
      expect(derivePermission('GET', '/api/brushes')).toBe('read:brush');
    });

    it("should drop 'es' from -xes plurals (boxes → box)", () => {
      expect(derivePermission('GET', '/api/boxes')).toBe('read:box');
    });

    it('should leave a non-plural word unchanged', () => {
      expect(derivePermission('GET', '/api/data')).toBe('read:data');
    });
  });
});
