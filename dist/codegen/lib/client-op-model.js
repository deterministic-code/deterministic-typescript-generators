const PARAM_RE = /\{([^}]+)\}/g;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
/** The HTTP verbs that carry a request body — the emitted client accepts a `body` argument for exactly these, and everything else is param-only. */
export const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
export function cap(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}
/** The path-parameter names of an OpenAPI path, in order (`/contacts/{contactId}/phones/{id}` → `["contactId", "id"]`) — the leading arguments the emitted client function takes. */
export function pathParamsOf(path) {
    return [...path.matchAll(PARAM_RE)].map((m) => m[1]);
}
/** An OpenAPI path rewritten as a JS template-literal body: `{id}` → `${id}`, so the client (and its test) build the same URL. */
export function templatePath(path) {
    return path.replace(PARAM_RE, (_, name) => `\${${name}}`);
}
/** The exported function name the client emits for a route row: its `operationId` when that is a legal identifier, else a verb+camelCased-path fallback — derived one way so the test can call the exact function the client declares. */
export function fnNameOf(row) {
    if (row.name && IDENT_RE.test(row.name))
        return row.name;
    const slug = row.path
        .replace(/[^A-Za-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((w, i) => (i === 0 ? w : cap(w)))
        .join("");
    return `${row.method.toLowerCase()}${cap(slug)}`;
}
