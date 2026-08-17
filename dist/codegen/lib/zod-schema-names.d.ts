import type { CodegenNames } from "@deterministic-code/generator-sdk/codegen-naming";
type ClassNamer = Pick<CodegenNames, "className">;
/** The exported zod const for an OpenAPI component — `<ClassName>Schema` — so the validators generator and client_bindings (reference) all name a schema one way. */
export declare function schemaSymbol(componentName: string, names: ClassNamer): string;
/** The `z.infer` type alias exported alongside a schema — the class name with the `Validated` suffix. */
export declare function validatedSymbol(componentName: string, names: ClassNamer): string;
export {};
