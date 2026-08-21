import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-services.ts";

const DS_YAML = `types:
  - notification_type:
      fields:
        - channel_name:
            type: string
            is_unique: true
`;

const VIEW_YAML = `includes:
  - datasource_types:
      include: "*"
types: []
`;

const SERVICES_YAML = `includes:
  - view_type_services:
      filter: 'type is view_type'
services: []
`;

const fixtureReader = () =>
  memoryReader({
    "datasource_types.yaml": DS_YAML,
    "view_types.yaml": VIEW_YAML,
    "services.yaml": SERVICES_YAML,
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

describe("generate services casing", () => {
  it("Auto uses Camel files, Pascal types, Snake fields", async () => {
    const files = await byFilename({});
    assert.ok(files.has("notificationTypeService.ts"));
    const body = files.get("notificationTypeService.ts")!;
    assert.match(
      body,
      /export class NotificationTypeService extends BaseService<NotificationType>/,
    );
    assert.match(body, /async find_by_channel_name\(channel_name: string\)/);
  });

  it("Pascal file names", async () => {
    const files = await byFilename({
      "languages.typescript.casing.file_names": "Pascal",
    });
    assert.ok(files.has("NotificationTypeService.ts"));
  });

  it("Snake file names", async () => {
    const files = await byFilename({
      "languages.typescript.casing.file_names": "Snake",
    });
    assert.ok(files.has("notification_type_service.ts"));
  });

  it("Camel fields", async () => {
    const files = await byFilename({
      "languages.typescript.casing.fields": "Camel",
    });
    const body = files.get("notificationTypeService.ts")!;
    assert.match(body, /async findByChannelName\(channelName: string\)/);
  });

  it("Kebab directories with Pascal files under by-feature", async () => {
    const files = await byFilename({
      "other.organize_by_feature": "true",
      "languages.typescript.casing.file_names": "Pascal",
      "languages.typescript.casing.directories": "Kebab",
    });
    assert.ok(
      files.has("features/notification-type/NotificationTypeService.ts"),
    );
  });

  it("keeps the YAML custom service class name when types are camel", async () => {
    const files = new Map<string, string>();
    for (const entry of await generate({
      reader: memoryReader({
        "datasource_types.yaml": DS_YAML,
        "view_types.yaml": VIEW_YAML,
        "services.yaml": `includes:
  - view_type_services:
      filter: 'type is view_type'
services:
  - name: ContactImportService
`,
      }),
      settings: { "languages.typescript.casing.types": "Camel" },
    })) {
      files.set(entry.filename, entryBody(entry));
    }
    const body = files.get("../custom/contactImportService.ts");
    assert.ok(body, `got ${[...files.keys()].join(", ")}`);
    assert.match(
      body,
      /export class ContactImportService implements iContactImportService/,
    );
  });
});
