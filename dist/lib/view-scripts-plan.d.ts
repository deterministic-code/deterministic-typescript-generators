/** View codegen ownership contract — mirror of PATCH_PLAN in migrate-scripts-plan.mjs. The three view steps (view_types, view_type_validators, view_types_tests) each fully own a subtree of generated files; nothing outside those steps writes to those paths. Kind is `ownedFile` throughout: generators prune-and-regenerate on every run, so there are no marked sections to declare. Path patterns use `*` as a filename wildcard because per-entity filenames come from the user's view_types.yaml. */
interface PatchPlanEntry {
    path: string;
    kind: string;
}
export declare const VIEW_STEP_KINDS: readonly string[];
export declare const PATCH_PLAN_VIEW_TYPESCRIPT: Readonly<Record<string, readonly PatchPlanEntry[]>>;
export declare const PATCH_PLAN_VIEW_RUST: Readonly<Record<string, readonly PatchPlanEntry[]>>;
export declare function getViewPatchPlan(language: string, stepKey: string): readonly PatchPlanEntry[];
export {};
