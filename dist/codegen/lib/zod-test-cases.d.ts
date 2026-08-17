export declare function escapeForTestName(s: string): string;
/** A deep-enough clone of a fixture for a mutation to edit without disturbing the shared valid fixture — `Uint8Array` fields are copied by value so a binary column survives the round-trip. */
export declare function cloneFixture(fx: Record<string, unknown>): Record<string, unknown>;
export declare function renderValidCase(schemaName: string, fixture: unknown): string;
export declare function renderNullableVariantCase(schemaName: string, fixture: unknown): string;
export declare function renderMutationCase(schemaName: string, description: string, mutated: unknown): string;
