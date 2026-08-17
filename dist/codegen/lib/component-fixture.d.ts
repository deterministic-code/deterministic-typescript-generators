interface SampleOptions {
    datetime?: string;
    ident?: (key: string) => string;
}
interface IdentOptions {
    ident?: (key: string) => string;
}
interface Mutation {
    description: string;
    mutate: (fx: Record<string, unknown>) => Record<string, unknown>;
}
interface ScalarSetField {
    key: string;
    next: unknown;
}
/** A complete JS value conforming to an arbitrary schema node (inline object, `$ref`, array, or scalar), resolving refs through `components`. The request/response-body counterpart of `sampleForComponent` for client-binding tests, whose bodies are frequently inline rather than named. */
export declare function sampleForSchema(schema: unknown, components: unknown, { datetime, ident }?: SampleOptions): unknown;
/** A complete JS value conforming to component `name`, filling every property so it satisfies both the frontend_types interface and the zod schema. `datetime` picks the date-time representation: `"native"` yields `Date` objects (matching the generated interface), `"string"` yields ISO strings (the wire shape client bodies and `z.coerce.date()` accept). `ident` casing-maps each property key so the fixture matches the generated field names (types/validators pass `CodegenFieldNames.ident`; wire-key bodies pass identity). */
export declare function sampleForComponent(name: string, components: unknown, { datetime, ident }?: SampleOptions): Record<string, unknown>;
/** Like `sampleForComponent`, but every top-level nullable field is set to `null` — the payload that proves a `.nullable()` schema accepts null. */
export declare function nullableVariantForComponent(name: string, components: unknown, { datetime, ident }?: SampleOptions): unknown;
/** The top-level nullable field names of component `name` (casing-mapped by `ident`) — the set a nullable-variant payload nulls out (empty means no nullable field, so no nullable case is worth generating). */
export declare function nullableFieldNames(name: string, components: unknown, { ident }?: IdentOptions): string[];
/** The invalid-payload mutations for component `name`: dropping or nulling each required (non-nullable) field, and wrong-typing each plain scalar. Each `{ description, mutate }` transforms a valid fixture (keyed by `ident`) into one the zod schema must reject — the negative half of the validators test. */
export declare function enumerateComponentMutations(name: string, components: unknown, { ident }?: IdentOptions): Mutation[];
/** The plain-scalar, non-nullable field names of component `name` (casing-mapped by `ident`) whose value can be reassigned in a get/set accessor test, each paired with a type-correct replacement value. Excludes enum / uuid / date-time / ref / array fields whose typed replacement would be fiddly. */
export declare function scalarSetFields(name: string, components: unknown, { ident }?: IdentOptions): ScalarSetField[];
export {};
