import { createEmitter } from "./emit-datasource-tests-typescript.js";
import { makeDatasourceEmit } from "@deterministic-code/generator-sdk/codegen/lib/datasource-emit-config";
/** Self-describing emit for the typescript datasource-type tests — wraps the shared `emit-datasource-tests-typescript` render via `makeDatasourceEmit`. */
export const emit = makeDatasourceEmit(createEmitter, "typescript");
