import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { CONTACTS_ENGINES, useContactsApp } from './functional/contactsApp';

describe.each(CONTACTS_ENGINES)(
  'eager-write cascade delete does not self-deadlock on a pooled dialect (%s)',
  (engine) => {
    const getApp = useContactsApp(engine);

    it(
      'DELETE /api/contacts/:id resolves instead of blocking forever on the outer txn (#1753)',
      { timeout: 20_000 },
      async () => {
        const { app, backend } = getApp();

        const created = await request(app)
          .post('/api/contacts')
          .send({
            contact_source_name: 'Manual',
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.com',
            addresses: [{ line1: '1 Analytical Way', city: 'London' }],
            phones: [{ number: '+44-20-0000-0000', label: 'mobile' }],
          });
        expect(created.status).toBe(201);
        const contactId = created.body.id as number;
        expect(created.body.addresses).toHaveLength(1);
        expect(created.body.phones).toHaveLength(1);

        const deleted = await request(app).delete(`/api/contacts/${contactId}`);
        expect([200, 204]).toContain(deleted.status);

        const parents = await backend.datasource.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM contacts WHERE id = ${contactId}`,
        );
        expect(Number(parents[0].count)).toBe(0);

        const children = await backend.datasource.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM addresses WHERE contact_id = ${contactId}`,
        );
        expect(Number(children[0].count)).toBe(0);
      },
    );
  },
);
