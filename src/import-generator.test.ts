import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createImportGenerator,
  FRONTEND_VIEW_DIR,
} from "./import-generator.ts";

describe("TypeScriptImportGenerator", () => {
  it("returns layered files when organize_by_feature is unset", () => {
    const imports = createImportGenerator(".", {});
    assert.equal(imports.datasource("user"), "user.ts");
    assert.equal(imports.view("card_payment"), "card_payment.ts");
    assert.equal(imports.service("user"), "user_service.ts");
    assert.equal(imports.route("user"), "user.ts");
    assert.equal(imports.serviceTest("user"), "user_service.test.ts");
    assert.equal(imports.routeTest("user"), "user.integration.test.ts");
    assert.equal(imports.index("user.ts"), "index.ts");
    assert.equal(imports.datasourceRel("user"), "types/generated/datasource/user.ts");
    assert.equal(imports.spec("user_service.ts", "user.ts"), "./user");
    assert.equal(imports.test("user.ts", "user"), "user.test.ts");
    assert.equal(imports.testSpec("user.ts", "user"), "../user");
  });

  it("nests files under features/ when organize_by_feature is true", () => {
    const imports = createImportGenerator(".", {
      "other.organize_by_feature": "true",
    });
    assert.equal(imports.datasource("user"), "features/user/user.ts");
    assert.equal(
      imports.view("create_card_payment"),
      "features/card_payment/create_card_payment.ts",
    );
    assert.equal(
      imports.datasourceValidator("user"),
      "features/user/user.validator.ts",
    );
    assert.equal(imports.index("features/user/user.ts"), "");
    assert.equal(imports.datasourceRel("user"), "features/user/user.ts");
    assert.equal(
      imports.test("features/user/user.ts", "user"),
      "features/user/__tests__/user.test.ts",
    );
  });

  it("places frontend files under basePath and still emits an index", () => {
    const imports = createImportGenerator(FRONTEND_VIEW_DIR, {
      "other.organize_by_feature": "true",
    });
    assert.equal(imports.view("user"), "frontend/src/types/user.ts");
    assert.equal(
      imports.index("frontend/src/types/user.ts"),
      "frontend/src/types/index.ts",
    );
  });
});
