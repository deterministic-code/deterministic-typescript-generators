import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { useDeterministicRootApp } from './_backendAppMocks';

const TABLE_DDL = [
  `CREATE TABLE message_status (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, name TEXT, description TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE email_account (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, address TEXT, display_name TEXT, is_active INTEGER,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE folder (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, email_account_id INTEGER REFERENCES email_account(id),
     name TEXT, is_system INTEGER,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE message (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, folder_id INTEGER REFERENCES folder(id),
     message_status_id INTEGER REFERENCES message_status(id),
     subject TEXT, body TEXT, sender TEXT, received_at TEXT,
     created TEXT, updated TEXT
   )`,
  `CREATE TABLE attachment (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uuid TEXT, message_id INTEGER REFERENCES message(id),
     filename TEXT, mime_type TEXT, size_bytes INTEGER, data BLOB,
     created TEXT, updated TEXT
   )`,
];

const SEED_SQL = [
  `INSERT INTO message_status (id, uuid, name, description, created, updated) VALUES
     (1, 'ms1', 'Draft', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
     (2, 'ms2', 'Sent', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
];

describe('createBackendApp — nested-only entity with top-level by-field routes (email-backend)', () => {
  let app: Express;
  useDeterministicRootApp('email-backend', TABLE_DDL, SEED_SQL, (x) => (app = x.app), {
    perTest: false,
  });

  it('mounts by-field GETs on a nested-only entity (filename + message-id) and they return the seeded row', async () => {
    const accountRes = await request(app)
      .post('/api/email-accounts')
      .send({
        address: `byfield-${Date.now()}@example.com`,
        display_name: 'ByField',
        is_active: true,
      });
    expect(accountRes.status, JSON.stringify(accountRes.body)).toBe(201);
    const accountId = accountRes.body.id as number;

    const folderRes = await request(app)
      .post('/api/folders')
      .send({ email_account_id: accountId, name: `Inbox-${Date.now()}`, is_system: false });
    expect(folderRes.status, JSON.stringify(folderRes.body)).toBe(201);
    const folderId = folderRes.body.id as number;

    const msgRes = await request(app).post('/api/messages').send({
      folder_id: folderId,
      message_status_id: 1,
      subject: 'Hello',
      body: 'Body',
      sender: 'a@example.com',
    });
    expect(msgRes.status, JSON.stringify(msgRes.body)).toBe(201);
    const messageId = msgRes.body.id as number;

    const uniqueFilename = `byfield-attach-${Date.now()}.pdf`;
    const attachRes = await request(app)
      .post(`/api/messages/${messageId}/attachments`)
      .send({ filename: uniqueFilename, mime_type: 'application/pdf', size_bytes: 1024 });
    expect(attachRes.status, JSON.stringify(attachRes.body)).toBe(201);
    const attachmentId = attachRes.body.id as number;
    expect(attachRes.body.filename).toBe(uniqueFilename);
    expect(attachRes.body.message_id).toBe(messageId);

    const byFilenameRes = await request(app).get(`/api/attachments/filename/${uniqueFilename}`);
    expect(
      byFilenameRes.status,
      `expected 200 for /api/attachments/filename/{filename}; got ${byFilenameRes.status} body=${JSON.stringify(byFilenameRes.body)}`,
    ).toBe(200);
    expect(Array.isArray(byFilenameRes.body.items)).toBe(true);
    expect(byFilenameRes.body.items).toHaveLength(1);
    expect(byFilenameRes.body.items[0].id).toBe(attachmentId);
    expect(byFilenameRes.body.items[0].filename).toBe(uniqueFilename);
    expect(byFilenameRes.body.items[0].message_id).toBe(messageId);

    const byMessageIdRes = await request(app).get(`/api/attachments/message-id/${messageId}`);
    expect(
      byMessageIdRes.status,
      `expected 200 for /api/attachments/message-id/{messageId}; got ${byMessageIdRes.status} body=${JSON.stringify(byMessageIdRes.body)}`,
    ).toBe(200);
    expect(Array.isArray(byMessageIdRes.body.items)).toBe(true);
    expect(byMessageIdRes.body.items.some((it: { id: number }) => it.id === attachmentId)).toBe(
      true,
    );
    expect(
      byMessageIdRes.body.items.every((it: { message_id: number }) => it.message_id === messageId),
    ).toBe(true);

    // adversarial: standard CRUD member GET stays unmounted because attachment is nestedOnly
    const standardCrudRes = await request(app).get(`/api/attachments/${attachmentId}`);
    expect(
      standardCrudRes.status,
      `nested-only entity must NOT expose /api/attachments/{id}; got ${standardCrudRes.status}`,
    ).toBe(404);
  });
});
