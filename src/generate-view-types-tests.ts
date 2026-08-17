import { createGenerator } from "./generate-view-tests.ts";
import { makeViewGenerate } from "./sdk/codegen/lib/view-generate-config.ts";

export const generate = makeViewGenerate(createGenerator, "typescript");
