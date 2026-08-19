import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(
      `../templates/create-view-type-validators/${rel}`,
      import.meta.url,
    ),
    "utf8",
  );

export const [
  typeTmpl,
  indexTmpl,
  schemaUnionTmpl,
  schemaStandaloneTmpl,
  schemaInheritTmpl,
] = await Promise.all([
  resource("type.ts.tmpl"),
  resource("index.ts.tmpl"),
  resource("schema-union.ts.tmpl"),
  resource("schema-standalone.ts.tmpl"),
  resource("schema-inherit.ts.tmpl"),
]);
