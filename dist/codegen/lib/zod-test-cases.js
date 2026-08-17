import { serializeSampleValue as serializeValue } from "@deterministic-code/generator-sdk/codegen/lib/ts-sample-literal";
export function escapeForTestName(s) {
    return s.replace(/"/g, '\\"');
}
/** A deep-enough clone of a fixture for a mutation to edit without disturbing the shared valid fixture — `Uint8Array` fields are copied by value so a binary column survives the round-trip. */
export function cloneFixture(fx) {
    const out = {};
    for (const [k, v] of Object.entries(fx)) {
        out[k] = v instanceof Uint8Array ? new Uint8Array(v) : v;
    }
    return out;
}
export function renderValidCase(schemaName, fixture) {
    return [
        `  it("parses a valid payload", () => {`,
        `    const value = ${serializeValue(fixture)};`,
        `    expect(() => ${schemaName}.parse(value)).not.toThrow();`,
        `  });`,
    ].join("\n");
}
export function renderNullableVariantCase(schemaName, fixture) {
    return [
        `  it("accepts null for nullable fields", () => {`,
        `    const value = ${serializeValue(fixture)};`,
        `    expect(() => ${schemaName}.parse(value)).not.toThrow();`,
        `  });`,
    ].join("\n");
}
export function renderMutationCase(schemaName, description, mutated) {
    return [
        `  it("rejects when ${escapeForTestName(description)}", () => {`,
        `    const value = ${serializeValue(mutated)};`,
        `    expect(() => ${schemaName}.parse(value)).toThrow();`,
        `  });`,
    ].join("\n");
}
