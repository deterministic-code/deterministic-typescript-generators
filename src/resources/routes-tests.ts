import { readFile } from "node:fs/promises";

const resource = (rel: string): Promise<string> =>
  readFile(
    new URL(`../templates/create-routes-tests/${rel}`, import.meta.url),
    "utf8",
  );

export const [
  mockFactoryTmpl,
  readonlyTmpl,
  crudTmpl,
  byFieldGetUniqueTmpl,
  byFieldGetListTmpl,
  byFieldPutUniqueTmpl,
  byFieldPutListTmpl,
  byFieldDeleteUniqueTmpl,
  byFieldDeleteListTmpl,
] = await Promise.all([
  resource("mock-factory.ts.tmpl"),
  resource("readonly.test.ts.tmpl"),
  resource("crud.test.ts.tmpl"),
  resource("by-field-get-unique.ts.tmpl"),
  resource("by-field-get-list.ts.tmpl"),
  resource("by-field-put-unique.ts.tmpl"),
  resource("by-field-put-list.ts.tmpl"),
  resource("by-field-delete-unique.ts.tmpl"),
  resource("by-field-delete-list.ts.tmpl"),
]);
