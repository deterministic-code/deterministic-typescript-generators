/** The exported zod const for an OpenAPI component — `<ClassName>Schema` — so the validators generator and client_bindings (reference) all name a schema one way. */
export function schemaSymbol(componentName, names) {
    return `${names.className(componentName)}Schema`;
}
/** The `z.infer` type alias exported alongside a schema — the class name with the `Validated` suffix. */
export function validatedSymbol(componentName, names) {
    const className = names.className(componentName);
    return `${className}Validated`;
}
