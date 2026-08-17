interface RouteCandidate {
    primaryKey?: {
        column?: string;
        idType?: string;
    };
}
/** A factory for the nth distinct sample id of `idType`, as both a URL segment (`url`) and a TS literal (`lit`). Emitted CRUD and nested router tests use it so a uuid project's `/:id` path params and mocked ids stay format-valid (a canonical 36-char uuid the runtime's `parseRouteId` accepts) instead of numeric — an integer path would 400 against a uuid router. */
export declare function sampleIdFactory(idType: string): (n: number) => {
    url: string;
    lit: string;
};
/** The `{id}` column name, resolved id_type, and the nth-sample-id URL/TS-literal expressions a router test derives from a candidate's primary key — shared by the CRUD and read-only router-test emitters so both honor `primaryKey.idType` one way (and build a matching mock `PrimaryKey`). */
export declare function candidateIdExprs(candidate: RouteCandidate): {
    idFieldName: string;
    idType: string;
    idValueExpr: (n: number) => string;
    idPathExpr: (n: number) => string;
};
export {};
