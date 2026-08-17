import { createGenerator } from "./generate-datasource-tests.ts";
import { makeDatasourceGenerate } from "./sdk/codegen/lib/datasource-generate-config.ts";

/** Self-describing generate for the typescript datasource-type tests — wraps the shared `generate-datasource-tests` render via `makeDatasourceGenerate`. */
export const generate = makeDatasourceGenerate(createGenerator, "typescript");
