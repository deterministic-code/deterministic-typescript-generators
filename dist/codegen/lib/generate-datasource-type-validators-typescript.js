import { createGenerator } from "./generate-datasource-validator-typescript.js";
import { makeDatasourceGenerate } from "@deterministic-code/generator-sdk/codegen/lib/datasource-generate-config";
/** Self-describing generate for the typescript datasource-type validators — wraps the shared `generate-datasource-validator-typescript` render via `makeDatasourceGenerate`. */
export const generate = makeDatasourceGenerate(createGenerator, "typescript");
