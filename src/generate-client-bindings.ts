import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { createIndex, loadClientBindingsIr } from "./client-bindings-ir.ts";
import { clientBindingPaths } from "./common/paths.ts";
import {
  axiosHttpTmpl,
  entityTmpl,
  fetchHttpTmpl,
  rootIndexTmpl,
  tanstackIndexTmpl,
  tanstackTmpl,
  transportIndexTmpl,
} from "./resources/client-bindings.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const ir = await loadClientBindingsIr(ctx);
  const naming = clientBindingPaths();
  const fetch = naming.transport("fetch");
  const axios = naming.transport("axios");
  const tanstack = naming.transport("tanstack");
  const entries: GenerateEntry[] = [
    content(fetch.httpPath, fetchHttpTmpl),
    content(axios.httpPath, axiosHttpTmpl),
    ...ir.entities.flatMap((entity) => [
      content(fetch.filePath(entity.fileBase), fill(entityTmpl, entity)),
      content(axios.filePath(entity.fileBase), fill(entityTmpl, entity)),
      content(tanstack.filePath(entity.fileBase), fill(tanstackTmpl, entity)),
    ]),
  ];
  if (!createIndex(ctx.settings)) return entries;
  const indexTokens = { entities: ir.entities, hasHttp: true };
  entries.push(
    content(fetch.indexPath, fill(transportIndexTmpl, indexTokens)),
    content(axios.indexPath, fill(transportIndexTmpl, indexTokens)),
    content(
      tanstack.indexPath,
      fill(tanstackIndexTmpl, { entities: ir.entities }),
    ),
    content(naming.rootIndex, rootIndexTmpl),
  );
  return entries;
};
