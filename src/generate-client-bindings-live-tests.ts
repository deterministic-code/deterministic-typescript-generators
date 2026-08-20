import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { loadClientBindingsIr } from "./client-bindings-ir.ts";
import { clientBindingPaths } from "./common/paths.ts";
import {
  httpEntityTmpl,
  tanstackEntityTmpl,
} from "./resources/client-bindings-live-tests.ts";

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const ir = await loadClientBindingsIr(ctx);
  const naming = clientBindingPaths();
  const fetch = naming.transport("fetch");
  const axios = naming.transport("axios");
  const tanstack = naming.transport("tanstack");
  return ir.entities.flatMap((entity) => [
    content(fetch.liveTestPath(entity.fileBase), fill(httpEntityTmpl, entity)),
    content(axios.liveTestPath(entity.fileBase), fill(httpEntityTmpl, entity)),
    content(
      tanstack.liveTestPath(entity.fileBase),
      fill(tanstackEntityTmpl, entity),
    ),
  ]);
};
