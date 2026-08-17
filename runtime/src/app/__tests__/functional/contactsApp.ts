import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createBackendApp } from '../../createBackendApp';
import { errorHandler } from '../../../middleware/errorHandler';
import { startSqlBackend, type SqlBackend, type SqlEngine } from './sqlContainer';

export const CONTACTS_ENGINES: SqlEngine[] = ['postgres', 'mysql'];

const deterministicRoot = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'samples',
  'contacts-backend',
  'deterministic',
);

export interface ContactsApp {
  backend: SqlBackend;
  app: Express;
}

async function startContactsApp(engine: SqlEngine): Promise<ContactsApp> {
  const backend = await startSqlBackend(engine, deterministicRoot);
  const app = await createBackendApp(backend.conn, {
    deterministicRoot,
    backendAppConfig: {
      middleware: [{ name: 'jsonBody', type: 'app', enabled: true }],
      handlers: [],
      statics: [],
    },
    routeSpecs: [],
    serviceSpecs: [],
  });
  app.use(errorHandler);
  return { backend, app };
}

/** Registers the container + app lifecycle on the calling suite and returns a getter for the built app. */
export function useContactsApp(engine: SqlEngine): () => ContactsApp {
  let ctx: ContactsApp;
  beforeAll(async () => {
    ctx = await startContactsApp(engine);
  });
  afterAll(async () => {
    await ctx?.backend.stop();
  });
  return () => ctx;
}
