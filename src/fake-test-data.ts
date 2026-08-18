export type LanguageTarget = "typescript" | "rust" | "csharp";
export type SqlDialect = "postgres" | "sqlite" | "mysql" | "sqlserver" | "oracle";
export type FakeTestTarget = LanguageTarget | SqlDialect;
export type FakeTestStrategy = "faker" | "homegrown";

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

export const typescriptFakerTestData: IFakeTestData = {
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

export const typescriptHomegrownTestData: IFakeTestData = {
  target: "typescript",
  strategy: "homegrown",
  prelude: () => [],
  uuid: () => "crypto.randomUUID()",
  string: (size) =>
    size === undefined
      ? "crypto.randomUUID()"
      : `crypto.randomUUID().slice(0, ${size})`,
  integer: () => "1",
  biginteger: () => "1n",
  float: () => "1.0",
  decimal: () => `"0"`,
  boolean: () => "false",
  datetime: () => "new Date()",
  date: () => "new Date().toISOString().slice(0, 10)",
  email: () => "`${crypto.randomUUID()}@example.com`",
  binary: () => `"AAAAAAAAAAAAAAAAAAAAAA=="`,
  id: (idType) => idExpr(typescriptHomegrownTestData, idType),
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

/** `datetime()` is a Date expression; string mode appends `.toISOString()` so the same impl covers native and wire shapes. */
export const datetimeLiteral = (
  data: IFakeTestData,
  datetime: string,
): string =>
  datetime === "native"
    ? data.datetime()
    : `${data.datetime()}.toISOString()`;
