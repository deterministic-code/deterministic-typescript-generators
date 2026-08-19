type LanguageTarget = "typescript" | "rust" | "csharp";
type SqlDialect = "postgres" | "sqlite" | "mysql" | "sqlserver" | "oracle";
type FakeTestTarget = LanguageTarget | SqlDialect;
type FakeTestStrategy = "faker" | "homegrown";

export type IdType = "integer" | "biginteger" | "uuid" | "string";

/** Source expressions for one generated-test target. Faker vs homegrown is the strategy; dialect is the language or SQL dialect the snippet must compile as. */
export interface IFakeTestData {
  readonly target: FakeTestTarget;
  readonly strategy: FakeTestStrategy;

  /** Import / use / using lines the generated file needs. Empty when the dialect needs none. */
  prelude: () => string[];

  uuid: () => string;
  string: (size?: number) => string;
  integer: () => string;
  biginteger: () => string;
  float: () => string;
  decimal: () => string;
  boolean: () => string;
  datetime: () => string;
  date: () => string;
  email: () => string;
  binary: () => string;

  id: (idType: IdType) => string;
}

const idExpr = (data: IFakeTestData, idType: IdType): string => {
  if (idType === "uuid") return data.uuid();
  if (idType === "string") return data.string();
  if (idType === "biginteger") return data.biginteger();
  return data.integer();
};

const typescriptFakerTestData: IFakeTestData = {
  target: "typescript",
  strategy: "faker",
  prelude: () => [`import { faker } from "@faker-js/faker";`],
  uuid: () => "faker.string.uuid()",
  string: (size) =>
    size === undefined
      ? "faker.string.alphanumeric({ length: 12 })"
      : `faker.string.alphanumeric({ length: ${size} })`,
  integer: () => "faker.number.int({ min: 1 })",
  biginteger: () => "faker.number.bigInt({ min: 1n })",
  float: () => "faker.number.float()",
  decimal: () => "faker.commerce.price()",
  boolean: () => "faker.datatype.boolean()",
  datetime: () => "faker.date.recent()",
  date: () => "faker.date.recent().toISOString().slice(0, 10)",
  email: () => "faker.internet.email()",
  binary: () => "faker.string.alphanumeric({ length: 24 })",
  id: (idType) => idExpr(typescriptFakerTestData, idType),
};

export const fakeTestData: IFakeTestData = typescriptFakerTestData;

export const asIdType = (idType: string): IdType => {
  if (idType === "uuid" || idType === "string" || idType === "biginteger") {
    return idType;
  }
  return "integer";
};

export const preludeSource = (data: IFakeTestData): string => {
  const lines = data.prelude();
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
};

/** TypeScript source for one spec field in a generated test. `nativeType` is the id-column override (`bigint`). */
export const fieldExpr = (
  data: IFakeTestData,
  type: string,
  opts: { nativeType?: string; size?: number } = {},
): string => {
  if (opts.nativeType === "bigint") return data.biginteger();
  switch (type) {
    case "uuid":
      return data.uuid();
    case "string":
    case "character":
      return data.string(opts.size);
    case "email":
      return data.email();
    case "binary":
      return data.binary();
    case "boolean":
      return data.boolean();
    case "decimal":
      return data.decimal();
    case "float":
      return data.float();
    case "datetime":
      return data.datetime();
    case "date":
      return data.date();
    case "number":
    case "integer":
    case "smallinteger":
    case "biginteger":
    case "unsignedinteger":
    case "unsignedsmallinteger":
    case "unsignedbiginteger":
    case "reference":
      return data.integer();
    default:
      return data.string(opts.size);
  }
};
