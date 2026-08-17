interface ClientRouteRow {
    method: string;
    path: string;
    name?: string;
}
/** The HTTP verbs that carry a request body — the generated client accepts a `body` argument for exactly these, and everything else is param-only. */
export declare const BODY_METHODS: Set<string>;
export declare function cap(name: string): string;
/** The path-parameter names of an OpenAPI path, in order (`/contacts/{contactId}/phones/{id}` → `["contactId", "id"]`) — the leading arguments the generated client function takes. */
export declare function pathParamsOf(path: string): string[];
/** An OpenAPI path rewritten as a JS template-literal body: `{id}` → `${id}`, so the client (and its test) build the same URL. */
export declare function templatePath(path: string): string;
/** The exported function name the client generates for a route row: its `operationId` when that is a legal identifier, else a verb+camelCased-path fallback — derived one way so the test can call the exact function the client declares. */
export declare function fnNameOf(row: ClientRouteRow): string;
export {};
