import {
  assertEntry,
  entriesFromFiles,
  skeletonEntriesFromFiles,
  type GenerateEntry,
} from "./generate-result.ts";
import type { SettingsDict } from "../../settings-dict.ts";

/** The context every generate lane's `plan` callback receives: the resolved folder inputs plus the flat `SettingsDict`. */
export interface GenerateContext {
  inputs: unknown;
  settings: SettingsDict;
}

interface FileLike {
  path: string;
  content: string;
}

/** What a lane's `plan` may return: native `GenerateEntry[]`, or a `{ files }` bag the core normalizes (whole-file `content`, or skeleton `patch` targets when `skeletonTarget` matches). */
export type PlanOutput =
  | GenerateEntry[]
  | { files: FileLike[]; skeletonTarget?: (path: string) => boolean };

function normalize(output: PlanOutput): GenerateEntry[] {
  if (Array.isArray(output)) return output;
  return output.skeletonTarget
    ? skeletonEntriesFromFiles(output.files, output.skeletonTarget)
    : entriesFromFiles(output.files);
}

/** The one common generate entry every lane routes through: await the lane's `plan`, normalize whatever it produced (files or native entries) into validated `GenerateEntry[]`. This is the ONE place the files→entries normalization lives. */
export function makeGenerate<Ctx extends GenerateContext>(
  plan: (ctx: Ctx) => PlanOutput | Promise<PlanOutput>,
): (ctx: Ctx) => Promise<GenerateEntry[]> {
  return async function generate(ctx: Ctx): Promise<GenerateEntry[]> {
    const entries = normalize(await plan(ctx));
    for (const entry of entries) {
      assertEntry(entry as Record<string, unknown>);
    }
    return entries;
  };
}
