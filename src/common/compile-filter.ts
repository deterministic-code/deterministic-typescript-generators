const KINDS = new Set(["datasource_type", "view_type", "service", "route"]);
const NAMESPACES = new Set(["datasource_types"]);

export type FilterCandidate = {
  name: string;
  kind: string;
  inheritsNamespace: string;
};

export type FilterPredicate = (cand: FilterCandidate) => boolean;

const CLAUSE =
  /^(?:type\s+is\s+(not\s+)?(\w+)|type\s+inherits\s+(not\s+)?(\w+)|type\s*(==|!=)\s*"([^"]*)"|true|false)$/;

const compileClause = (
  clause: string,
  contextLabel: string,
): FilterPredicate => {
  const m = clause.match(CLAUSE);
  if (m === null) {
    throw new Error(
      `${contextLabel}: unknown identifier or syntax near "${clause}". Supported: \`type is [not] <kind>\`, \`type inherits [not] <namespace>\`, \`type == "name"\`, logical ||. Kinds: ${[...KINDS].join(", ")}. Namespaces: ${[...NAMESPACES].join(", ")}.`,
    );
  }
  if (clause === "true") return () => true;
  if (clause === "false") return () => false;
  if (m[2] !== undefined) {
    if (!KINDS.has(m[2])) {
      throw new Error(`${contextLabel}: unknown kind "${m[2]}"`);
    }
    const negated = m[1] !== undefined;
    const kind = m[2];
    return (cand) => (cand.kind === kind) !== negated;
  }
  if (m[4] !== undefined) {
    if (!NAMESPACES.has(m[4])) {
      throw new Error(`${contextLabel}: unknown namespace "${m[4]}"`);
    }
    const negated = m[3] !== undefined;
    const ns = m[4];
    return (cand) => (cand.inheritsNamespace === ns) !== negated;
  }
  const name = m[6];
  const negated = m[5] === "!=";
  return (cand) => (cand.name === name) !== negated;
};

export const compileFilter = (
  filterExpr: string | null | undefined,
  contextLabel = "filter",
): FilterPredicate => {
  if (!filterExpr) return () => true;
  const predicates = filterExpr
    .split("||")
    .map((clause) => compileClause(clause.trim(), contextLabel));
  return (cand) => predicates.some((predicate) => predicate(cand));
};

export const compileServicesFilter = (
  filterExpr: string | null | undefined,
): FilterPredicate => compileFilter(filterExpr, "view_type_services.filter");

export const compileRoutesFilter = (
  filterExpr: string | null | undefined,
): FilterPredicate => compileFilter(filterExpr, "view_type_routes.filter");
