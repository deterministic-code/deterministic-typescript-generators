import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-routes/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  readonlyTmpl,
  crudTmpl,
  customStubTmpl,
  indexTmpl,
  byFieldGetUniqueTmpl,
  byFieldGetListTmpl,
  byFieldPutUniqueTmpl,
  byFieldPutListTmpl,
  byFieldDeleteUniqueTmpl,
  byFieldDeleteListTmpl,
] = await Promise.all([
  resource("readonly.ts.tmpl"),
  resource("crud.ts.tmpl"),
  resource("custom-stub.ts.tmpl"),
  resource("index.ts.tmpl"),
  resource("by-field-get-unique.ts.tmpl"),
  resource("by-field-get-list.ts.tmpl"),
  resource("by-field-put-unique.ts.tmpl"),
  resource("by-field-put-list.ts.tmpl"),
  resource("by-field-delete-unique.ts.tmpl"),
  resource("by-field-delete-list.ts.tmpl"),
]);
