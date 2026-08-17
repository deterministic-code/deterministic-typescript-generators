import { STEPS } from "@deterministic-code/generator-sdk/import-paths";
import { createGenerator } from "./generate-view-validator-typescript.js";
import { makeViewGenerate } from "@deterministic-code/generator-sdk/codegen/lib/view-generate-config";
export const generate = makeViewGenerate(createGenerator, STEPS.VIEW_TYPE_VALIDATORS, "typescript");
