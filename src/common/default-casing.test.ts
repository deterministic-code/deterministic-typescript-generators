import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCasing, DEFAULT_CASING } from "./default-casing.ts";

const NAME = "notification_type";

describe("createCasing Auto defaults", () => {
  it("matches Default Casings for TypeScript", () => {
    assert.deepEqual(DEFAULT_CASING, {
      file_names: "Camel",
      types: "Pascal",
      fields: "Snake",
      directories: "Camel",
    });
    const casing = createCasing({});
    assert.equal(casing.convertFileName(NAME), "notificationType");
    assert.equal(casing.convertTypes(NAME), "NotificationType");
    assert.equal(casing.convertFields(NAME), "notification_type");
    assert.equal(casing.convertDirectories(NAME), "notificationType");
    assert.equal(casing.filePath(NAME), "notificationType.ts");
    assert.equal(casing.serviceClassName("user"), "UserService");
  });

  it("puts Auto files under a cased feature directory", () => {
    const casing = createCasing({ "other.organize_by_feature": "true" });
    assert.equal(
      casing.filePath(NAME),
      "features/notificationType/notificationType.ts",
    );
    assert.equal(
      casing.filePath("create_notification_type"),
      "features/notificationType/createNotificationType.ts",
    );
  });
});

describe("createCasing overrides", () => {
  it("pascals file names", () => {
    const casing = createCasing({
      "languages.typescript.casing.file_names": "Pascal",
    });
    assert.equal(casing.filePath(NAME), "NotificationType.ts");
    assert.equal(casing.convertTypes(NAME), "NotificationType");
    assert.equal(casing.convertFields(NAME), "notification_type");
  });

  it("kebabs file names and directories", () => {
    const casing = createCasing({
      "other.organize_by_feature": "true",
      "languages.typescript.casing.file_names": "Kebab",
      "languages.typescript.casing.directories": "Kebab",
    });
    assert.equal(
      casing.filePath(NAME),
      "features/notification-type/notification-type.ts",
    );
  });

  it("snakes type names", () => {
    const casing = createCasing({
      "languages.typescript.casing.types": "Snake",
    });
    assert.equal(casing.convertTypes(NAME), "notification_type");
  });

  it("camels fields", () => {
    const casing = createCasing({
      "languages.typescript.casing.fields": "Camel",
    });
    assert.equal(casing.convertFields("role_id"), "roleId");
    assert.equal(casing.fieldIdent("role_id"), "roleId");
  });

  it("pascals fields", () => {
    const casing = createCasing({
      "languages.typescript.casing.fields": "Pascal",
    });
    assert.equal(casing.convertFields("role_id"), "RoleId");
  });

  it("kebabs fields", () => {
    const casing = createCasing({
      "languages.typescript.casing.fields": "Kebab",
    });
    assert.equal(casing.convertFields("role_id"), "role-id");
    assert.equal(casing.fieldIdent("role_id"), '"role-id"');
  });

  it("snakes directories independently of files", () => {
    const casing = createCasing({
      "other.organize_by_feature": "true",
      "languages.typescript.casing.file_names": "Pascal",
      "languages.typescript.casing.directories": "Snake",
    });
    assert.equal(
      casing.filePath(NAME),
      "features/notification_type/NotificationType.ts",
    );
  });
});
