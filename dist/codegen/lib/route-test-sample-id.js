/** A factory for the nth distinct sample id of `idType`, as both a URL segment (`url`) and a TS literal (`lit`). Emitted CRUD and nested router tests use it so a uuid project's `/:id` path params and mocked ids stay format-valid (a canonical 36-char uuid the runtime's `parseRouteId` accepts) instead of numeric — an integer path would 400 against a uuid router. */
export function sampleIdFactory(idType) {
    return (n) => {
        if (idType === "uuid") {
            const value = `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
            return { url: value, lit: JSON.stringify(value) };
        }
        if (idType === "string")
            return { url: String(n), lit: JSON.stringify(String(n)) };
        return { url: String(n), lit: String(n) };
    };
}
/** The `{id}` column name, resolved id_type, and the nth-sample-id URL/TS-literal expressions a router test derives from a candidate's primary key — shared by the CRUD and read-only router-test emitters so both honor `primaryKey.idType` one way (and build a matching mock `PrimaryKey`). */
export function candidateIdExprs(candidate) {
    const column = candidate.primaryKey?.column ?? "id";
    const idType = candidate.primaryKey?.idType ?? "integer";
    const sampleId = sampleIdFactory(idType);
    return {
        idFieldName: column,
        idType,
        idValueExpr: (n) => sampleId(n).lit,
        idPathExpr: (n) => sampleId(n).url,
    };
}
