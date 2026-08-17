import type { EmitEntry } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
import type { EmitArgs } from "./frontend-emit-types.ts";
/** Emit a self-contained zod validators file per object, placed by layout mode via `CodegenLayout.frontendValidatorFile` (flat `validators/<object>.ts`, by-feature `features/<object>/validators.ts`) — driven by the same `frontend_bindings.yaml` + route projection as `client_bindings`, so validators track the clients. Each file holds the zod schemas for the read + create/update/eager types that object's routes send/receive (transitive `$ref` closure); `client_bindings` imports them through the layout's `frontendRelImport`. Always emits when the step runs; `settings.frontend.generate_validators` gates only whether the frontend `--all` sweep includes this step (see emit.mjs runAll). `$ref` becomes `z.lazy(() => XSchema)` so circular refs survive ESM module init; datetime honors the setting (native → `z.coerce.date()`). */
export declare function emit({ inputs, settings }: EmitArgs): Promise<{
    entries: EmitEntry[];
}>;
export declare const entriesNative = true;
export declare const assembleAfterStep = true;
