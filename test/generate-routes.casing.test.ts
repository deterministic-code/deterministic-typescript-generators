import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { createCasing } from "../src/common/default-casing.ts";
import { generate } from "../src/generate-routes.ts";
import { createImportGenerator } from "../src/import-generator.ts";

const DS_YAML = `types:
  - contact:
      fields:
        - first_name:
            type: string
  - contact_group:
      fields:
        - name:
            type: string
  - contact_source:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
`;

const VIEW_YAML = `includes:
  - datasource_types:
      include: "*"
types: []
`;

const ROUTES_YAML = `includes:
  - view_type_routes:
      filter: 'type is view_type || type is datasource_type'
routes:
  - import_contacts:
      path: /api/contacts/import
      method: POST
  - migrate_legacy_contacts:
      path: /api/legacy-contacts/migrate
      method: POST
`;

const fixtureReader = () =>
  memoryReader({
    "datasource_types.yaml": DS_YAML,
    "view_types.yaml": VIEW_YAML,
    "routes.yaml": ROUTES_YAML,
  });

const entryBody = (entry: GenerateEntry): string => {
  if ("contents" in entry) return String(entry.contents);
  return entry.content;
};

const byFilename = async (settings: Record<string, string>) => {
  const map = new Map<string, string>();
  for (const entry of await generate({
    reader: fixtureReader(),
    settings,
  })) {
    map.set(entry.filename, entryBody(entry));
  }
  return map;
};

const serviceImportOf = (
  entity: string,
  settings: Record<string, string>,
): string => {
  const imports = createImportGenerator(".", settings);
  return imports.spec(imports.routeRel(entity), imports.serviceRel(entity));
};

const assertServiceImport = (
  body: string,
  entity: string,
  settings: Record<string, string>,
): void => {
  const spec = serviceImportOf(entity, settings);
  assert.ok(
    body.includes(`from "${spec}"`),
    `expected import from ${spec}; got:\n${body}`,
  );
};

describe("generate routes casing", () => {
  it("Auto uses Camel files, Pascal types, and IContactService", async () => {
    const settings = {};
    const files = await byFilename(settings);
    assert.ok(files.has("contact.ts"));
    assert.ok(files.has("contactGroup.ts"));
    const contact = files.get("contact.ts")!;
    const group = files.get("contactGroup.ts")!;
    assert.match(contact, /IContactService/);
    assert.match(group, /IContactGroupService/);
    assert.match(contact, /export function ContactRouter/);
    assert.match(group, /export function ContactGroupRouter/);
    assertServiceImport(contact, "contact", settings);
    assertServiceImport(group, "contact_group", settings);
    assert.doesNotMatch(contact, /IcontactService/);
  });

  it("Pascal file names", async () => {
    const files = await byFilename({
      "languages.typescript.casing.file_names": "Pascal",
    });
    assert.ok(files.has("Contact.ts"));
    assert.ok(files.has("ContactGroup.ts"));
    assert.match(files.get("Contact.ts")!, /IContactService/);
    assert.match(files.get("ContactGroup.ts")!, /IContactGroupService/);
  });

  it("Snake file names", async () => {
    const files = await byFilename({
      "languages.typescript.casing.file_names": "Snake",
    });
    assert.ok(files.has("contact.ts"));
    assert.ok(files.has("contact_group.ts"));
    assert.match(files.get("contact.ts")!, /IContactService/);
    assert.match(files.get("contact_group.ts")!, /IContactGroupService/);
  });

  it("Pascal types use IContactService / IContactGroupService", async () => {
    const settings = { "languages.typescript.casing.types": "Pascal" };
    const files = await byFilename(settings);
    const contact = files.get("contact.ts")!;
    const group = files.get("contactGroup.ts")!;
    assert.match(contact, /IContactService/);
    assert.match(group, /IContactGroupService/);
    assertServiceImport(contact, "contact", settings);
  });

  it("Snake types use i_contact_service / i_contact_group_service", async () => {
    const settings = { "languages.typescript.casing.types": "Snake" };
    const files = await byFilename(settings);
    const contact = files.get("contact.ts")!;
    const group = files.get("contactGroup.ts")!;
    const source = files.get("contactSource.ts")!;
    assert.match(contact, /i_contact_service/);
    assert.match(group, /i_contact_group_service/);
    assert.match(contact, /export function contact_router/);
    assert.match(group, /export function contact_group_router/);
    assert.match(source, /i_contact_source_service/);
    assert.doesNotMatch(contact, /IcontactService/);
    assert.doesNotMatch(contact, /Icontact_service/);
    assert.doesNotMatch(group, /Icontact_groupService/);
    assertServiceImport(contact, "contact", settings);
    assertServiceImport(group, "contact_group", settings);
  });

  it("Kebab directories with Pascal files under by-feature", async () => {
    const files = await byFilename({
      "other.organize_by_feature": "true",
      "languages.typescript.casing.file_names": "Pascal",
      "languages.typescript.casing.directories": "Kebab",
    });
    assert.ok(files.has("features/contact/Contact.route.ts"));
    assert.ok(files.has("features/contact-group/ContactGroup.route.ts"));
    assert.match(files.get("features/contact/Contact.route.ts")!, /IContactService/);
  });

  it("keeps authored custom route class names for runtime load", async () => {
    const settings = { "languages.typescript.casing.types": "Snake" };
    const files = new Map<string, string>();
    for (const entry of await generate({
      reader: memoryReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type is view_type || type is datasource_type'
routes:
  - echo:
      path: /api/echo
      method: GET
      routeClass: EchoRoute
      module: ./routes/echo-route
  - import_contacts:
      path: /api/contacts/import
      method: POST
`,
      }),
      settings,
    })) {
      files.set(entry.filename, entryBody(entry));
    }
    const casing = createCasing(settings);
    const echo = files.get("../echo-route.ts");
    assert.ok(echo, `missing echo-route; got ${[...files.keys()].join(", ")}`);
    assert.match(echo, /export class EchoRoute /);
    assert.doesNotMatch(echo, /export class echo_route /);
    const importPath = `../custom/${casing.fileBase("import_contacts_route")}.ts`;
    assert.match(files.get(importPath)!, /export class import_contacts /);
  });
});
