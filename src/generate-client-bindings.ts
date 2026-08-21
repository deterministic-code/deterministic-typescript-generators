import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { createIndex, loadClientBindingsIr } from "./client-bindings-ir.ts";
import {
  clientBindingFilePath,
  clientBindingHttpPath,
  clientBindingIndexPath,
  clientBindingRootIndex,
} from "./client-binding-transport.ts";
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
  const entries: GenerateEntry[] = [
    content(clientBindingHttpPath("fetch"), fetchHttpTmpl),
    content(clientBindingHttpPath("axios"), axiosHttpTmpl),
    ...ir.entities.flatMap((entity) => [
      content(
        clientBindingFilePath("fetch", entity.fileBase),
        fill(entityTmpl, entity),
      ),
      content(
        clientBindingFilePath("axios", entity.fileBase),
        fill(entityTmpl, entity),
      ),
      content(
        clientBindingFilePath("tanstack", entity.fileBase),
        fill(tanstackTmpl, entity),
      ),
    ]),
  ];
  if (!createIndex(ctx.settings)) return entries;
  const indexTokens = { entities: ir.entities, hasHttp: true };
  entries.push(
    content(clientBindingIndexPath("fetch"), fill(transportIndexTmpl, indexTokens)),
    content(clientBindingIndexPath("axios"), fill(transportIndexTmpl, indexTokens)),
    content(
      clientBindingIndexPath("tanstack"),
      fill(tanstackIndexTmpl, { entities: ir.entities }),
    ),
    content(clientBindingRootIndex, rootIndexTmpl),
  );
  return entries;
};
