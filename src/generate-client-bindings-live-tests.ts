import type { GenerateContext } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import {
  readBindings,
  bindingDatasource,
  resolveSelfDoc,
} from "./frontend-bindings-routes.ts";
import { layoutForSettings } from "./openapi/codegen/lib/ts-codegen-naming.ts";
import {
  buildLiveCtx,
  liveTags,
  renderLiveFile,
} from "./client-live-lifecycle.ts";
import { bindingsLiveHarnessEntries } from "./frontend-test-harness.ts";

const LIVE_CLIENT_LIBS = ["fetch", "axios"];

/** Generate a `<client>.bindings.live.ts` beside every generated fetch/axios client, driving the REAL client functions against a running backend + real database — no `vi.mock`, no stubbed transport. Unlike the mocked `client_bindings_mock_tests`, and unlike the previous list-only smoke test, these exercise EVERY endpoint of each object: a full CRUD lifecycle (create → read → update → delete), readonly reads, and sub-resource routes, seeding each route's FK parents recursively up the tree by driving the parents' own generated clients (so a `phone` create first creates its `contact`, whose `contact_source` id is read from the seeded lookup). tanstack is excluded (its hook needs a React renderer to run un-mocked). The `client_bindings_live` verify step launches the composed stack, points `BINDINGS_BASE_URL` at the proxy, and runs `npm run test:bindings-live`. Generates the frontend-root live harness once. */
export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const { datasources } = await readBindings(ctx.reader);
  const layout = layoutForSettings(ctx.settings, "typescript");
  const entries: GenerateEntry[] = [];
  for (const entry of datasources) {
    const ds = bindingDatasource(entry);
    const clients = ds.clients.filter((c: string) =>
      LIVE_CLIENT_LIBS.includes(c),
    );
    if (clients.length === 0) continue;
    const { doc } = await resolveSelfDoc({
      schema: ds.schema,
      reader: ctx.reader,
      settings: ctx.settings,
    });
    const live = buildLiveCtx(doc);
    for (const entity of liveTags(live)) {
      for (const client of clients) {
        const contents = renderLiveFile(live, {
          ds: ds.name,
          entity,
          client,
          layout,
        });
        if (!contents) continue;
        entries.push(
          content(
            layout.frontendClientFile(
              ds.name,
              entity,
              `${client}.bindings.live.ts`,
            ),
            contents,
          ),
        );
      }
    }
  }
  entries.push(...bindingsLiveHarnessEntries());
  return entries;
};
