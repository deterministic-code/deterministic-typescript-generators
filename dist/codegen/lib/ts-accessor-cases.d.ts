interface FieldAccessorCasesArgs {
    className: string;
    serializedFixture: string;
    entries: Iterable<[string, unknown]>;
    nullableNames: Iterable<string>;
}
/** The shared get/set + set-to-null accessor `it` cases for a generated datasource-type / view-type interface: one per field asserting assignment takes effect (with `next` derived to differ from the initial value), plus one per nullable field asserting it accepts null. Callers supply the resolved class name, the serialized fixture literal, the field entries, and the nullable field names. */
export declare function renderFieldAccessorCases({ className, serializedFixture, entries, nullableNames, }: FieldAccessorCasesArgs): string[];
export {};
