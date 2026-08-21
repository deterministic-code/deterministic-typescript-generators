import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { loadClientBindingsIr } from "./client-bindings-ir.ts";
import { clientBindingLiveTestPath } from "./client-binding-transport.ts";
import {
  httpEntityTmpl,
  tanstackEntityTmpl,
} from "./resources/client-bindings-live-tests.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const ir = await loadClientBindingsIr(ctx);
  return ir.entities.flatMap((entity) => [
    content(
      clientBindingLiveTestPath("fetch", entity.fileBase),
      fill(httpEntityTmpl, entity),
    ),
    content(
      clientBindingLiveTestPath("axios", entity.fileBase),
      fill(httpEntityTmpl, entity),
    ),
    content(
      clientBindingLiveTestPath("tanstack", entity.fileBase),
      fill(tanstackEntityTmpl, entity),
    ),
  ]);
};
