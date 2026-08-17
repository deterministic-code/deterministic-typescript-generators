import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { CONTACTS_ENGINES, useContactsApp } from './functional/contactsApp';

describe.each(CONTACTS_ENGINES)(
  'real driver constraint violations map to 4xx envelopes (%s, #1751)',
  (engine) => {
    const getApp = useContactsApp(engine);

    it('a foreign-key violation returns 400 FOREIGN_KEY', async () => {
      const res = await request(getApp().app)
        .post('/api/addresses')
        .send({ contact_id: 999999, line1: '404 Nowhere', city: 'Nullsville' });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].code).toBe('FOREIGN_KEY');
    });

    it('a unique violation returns 409 CONFLICT', async () => {
      const { app } = getApp();
      const name = 'Duplicate Group';

      const first = await request(app).post('/api/contact-groups').send({ name });
      expect(first.status).toBe(201);

      const second = await request(app).post('/api/contact-groups').send({ name });
      expect(second.status).toBe(409);
      expect(second.body.errors[0].code).toBe('CONFLICT');
    });
  },
);
