import { createEmitter } from "./emit-datasource-validator-typescript.js";
import { makeDatasourceEmit } from "@deterministic-code/generator-sdk/codegen/lib/datasource-emit-config";
/** Self-describing emit for the typescript datasource-type validators — wraps the shared `emit-datasource-validator-typescript` render via `makeDatasourceEmit`. */
export const emit = makeDatasourceEmit(createEmitter, "typescript");
