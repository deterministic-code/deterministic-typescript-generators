import { STEPS } from "@deterministic-code/generator-sdk/import-paths";
import { createEmitter } from "./emit-view-tests-typescript.ts";
import { makeViewEmit } from "@deterministic-code/generator-sdk/codegen/lib/view-emit-config";

export const emit = makeViewEmit(
  createEmitter,
  STEPS.VIEW_TYPES_TESTS,
  "typescript",
);
