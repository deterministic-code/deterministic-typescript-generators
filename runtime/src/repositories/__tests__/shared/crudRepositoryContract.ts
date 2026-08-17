import { ICrudRepository } from '../../ICrudRepository';

export interface SimpleRow {
  id: number;
  name: string;
  value: number;
}

export interface CrudContractSetup {
  repo: ICrudRepository<SimpleRow>;
  teardown: () => Promise<void>;
}

export function describeCrudRepositoryContract(
  name: string,
  setup: () => Promise<CrudContractSetup>,
): void {
  describe(`${name} satisfies ICrudRepository<SimpleRow>`, () => {
    let repo: ICrudRepository<SimpleRow>;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      const ctx = await setup();
      repo = ctx.repo;
      teardown = ctx.teardown;
    });

    afterEach(async () => {
      await teardown();
    });

    it('add() persists the row and assigns a positive id', async () => {
      const row = await repo.add({ name: 'a', value: 1 });
      expect(row.id).toBeGreaterThan(0);
      expect(row.name).toBe('a');
      expect(row.value).toBe(1);
    });

    it('find() returns the row by id', async () => {
      const created = await repo.add({ name: 'b', value: 2 });
      const found = await repo.find(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('b');
    });

    it('find() returns null for an unknown id', async () => {
      expect(await repo.find(987654)).toBeNull();
    });

    it('findAll() returns rows ordered by id ascending', async () => {
      const a = await repo.add({ name: 'x', value: 1 });
      const b = await repo.add({ name: 'y', value: 2 });
      const all = await repo.findAll();
      expect(all.map((r) => r.id)).toEqual([a.id, b.id]);
    });

    it('findBy() returns every row whose column matches value', async () => {
      await repo.add({ name: 'cat', value: 1 });
      await repo.add({ name: 'dog', value: 1 });
      await repo.add({ name: 'cat', value: 2 });
      const cats = await repo.findBy('name', 'cat');
      expect(cats.map((r) => r.value).sort()).toEqual([1, 2]);
    });

    describe('findIn', () => {
      it('returns every row whose column value is in the list, ordered by id ascending', async () => {
        const r1 = await repo.add({ name: 'a', value: 1 });
        await repo.add({ name: 'b', value: 2 });
        const r3 = await repo.add({ name: 'c', value: 3 });
        const result = await repo.findIn('value', [1, 3]);
        expect(result.map((r) => r.id)).toEqual([r1.id, r3.id]);
      });

      it('returns [] for an empty values array without throwing or querying', async () => {
        await repo.add({ name: 'a', value: 1 });
        const result = await repo.findIn('value', []);
        expect(result).toEqual([]);
      });

      it('ignores values that do not match any row', async () => {
        const r1 = await repo.add({ name: 'a', value: 1 });
        await repo.add({ name: 'b', value: 2 });
        const result = await repo.findIn('value', [1, 999]);
        expect(result.map((r) => r.id)).toEqual([r1.id]);
      });

      it('handles a single-element values array correctly', async () => {
        const r1 = await repo.add({ name: 'a', value: 1 });
        await repo.add({ name: 'b', value: 2 });
        const result = await repo.findIn('value', [1]);
        expect(result.map((r) => r.id)).toEqual([r1.id]);
      });
    });

    it('update() applies the patch and leaves untouched columns unchanged', async () => {
      const row = await repo.add({ name: 'old', value: 1 });
      const updated = await repo.update(row.id, { name: 'new' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('new');
      expect(updated!.value).toBe(1);
    });

    it('update() returns null when no row matches', async () => {
      expect(await repo.update(987654, { name: 'x' })).toBeNull();
    });

    it('delete() removes the row and returns true', async () => {
      const row = await repo.add({ name: 'gone', value: 1 });
      expect(await repo.delete(row.id)).toBe(true);
      expect(await repo.find(row.id)).toBeNull();
    });

    it('delete() returns false for an unknown id', async () => {
      expect(await repo.delete(987654)).toBe(false);
    });

    describe('updateBy', () => {
      it('returns [] when no row matches the column/value', async () => {
        await repo.add({ name: 'a', value: 1 });
        const updated = await repo.updateBy('name', 'missing', { value: 99 });
        expect(updated).toEqual([]);
      });

      it('updates a single matching row and returns it', async () => {
        const row = await repo.add({ name: 'solo', value: 1 });
        const updated = await repo.updateBy('name', 'solo', { value: 2 });
        expect(updated.map((r) => r.id)).toEqual([row.id]);
        expect(updated[0].value).toBe(2);
      });

      it('updates every matching row and returns them ordered by id', async () => {
        const a = await repo.add({ name: 'cat', value: 1 });
        await repo.add({ name: 'dog', value: 9 });
        const c = await repo.add({ name: 'cat', value: 3 });
        const updated = await repo.updateBy('name', 'cat', { value: 7 });
        expect(updated.map((r) => r.id)).toEqual([a.id, c.id]);
        expect(updated.every((r) => r.value === 7)).toBe(true);

        const dog = await repo.findBy('name', 'dog');
        expect(dog[0].value).toBe(9);
      });

      it('leaves untouched columns unchanged', async () => {
        await repo.add({ name: 'tag', value: 1 });
        const updated = await repo.updateBy('name', 'tag', { value: 42 });
        expect(updated[0].name).toBe('tag');
        expect(updated[0].value).toBe(42);
      });
    });

    describe('deleteBy', () => {
      it('returns 0 when no row matches', async () => {
        await repo.add({ name: 'a', value: 1 });
        expect(await repo.deleteBy('name', 'missing')).toBe(0);
      });

      it('deletes the single matching row and returns 1', async () => {
        const row = await repo.add({ name: 'solo', value: 1 });
        expect(await repo.deleteBy('name', 'solo')).toBe(1);
        expect(await repo.find(row.id)).toBeNull();
      });

      it('deletes every matching row and returns the count', async () => {
        await repo.add({ name: 'cat', value: 1 });
        const dog = await repo.add({ name: 'dog', value: 2 });
        await repo.add({ name: 'cat', value: 3 });
        expect(await repo.deleteBy('name', 'cat')).toBe(2);
        const remaining = await repo.findAll();
        expect(remaining.map((r) => r.id)).toEqual([dog.id]);
      });
    });
  });
}
