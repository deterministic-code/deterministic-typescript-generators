/** View codegen ownership contract — mirror of PATCH_PLAN in migrate-scripts-plan.mjs. The three view steps (view_types, view_type_validators, view_types_tests) each fully own a subtree of generated files; nothing outside those steps writes to those paths. Kind is `ownedFile` throughout: generators prune-and-regenerate on every run, so there are no marked sections to declare. Path patterns use `*` as a filename wildcard because per-entity filenames come from the user's view_types.yaml. */
export const VIEW_STEP_KINDS = Object.freeze([
    "view_types",
    "view_type_validators",
    "view_types_tests",
]);
const TS_PATHS = Object.freeze({
    view_types: Object.freeze(["types/generated/views/*.ts"]),
    view_type_validators: Object.freeze([
        "types/generated/views/validators/*.ts",
    ]),
    view_types_tests: Object.freeze([
        "types/generated/views/__tests__/*.test.ts",
    ]),
});
const RUST_PATHS = Object.freeze({
    view_types: Object.freeze(["src/view_types/*.rs"]),
    view_type_validators: Object.freeze(["src/view_validators/*.rs"]),
    view_types_tests: Object.freeze(["src/view_tests/*.rs"]),
});
function planEntries(pathsByStep) {
    const plan = {};
    for (const step of VIEW_STEP_KINDS) {
        plan[step] = pathsByStep[step].map((path) => ({ path, kind: "ownedFile" }));
    }
    return Object.freeze(plan);
}
export const PATCH_PLAN_VIEW_TYPESCRIPT = planEntries(TS_PATHS);
export const PATCH_PLAN_VIEW_RUST = planEntries(RUST_PATHS);
const PLANS_BY_LANGUAGE = Object.freeze({
    typescript: PATCH_PLAN_VIEW_TYPESCRIPT,
    rust: PATCH_PLAN_VIEW_RUST,
});
export function getViewPatchPlan(language, stepKey) {
    const plan = PLANS_BY_LANGUAGE[language];
    if (!plan) {
        throw new Error(`getViewPatchPlan: no PATCH_PLAN defined for language "${language}"`);
    }
    const entries = plan[stepKey];
    if (!entries) {
        throw new Error(`getViewPatchPlan: unknown view step "${stepKey}" (expected one of: ${VIEW_STEP_KINDS.join(", ")})`);
    }
    return entries;
}
