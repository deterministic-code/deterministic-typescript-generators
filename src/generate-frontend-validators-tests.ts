import { CodegenFieldNames } from "./sdk/field-names.ts";
import { namesForSettings } from "./sdk/codegen/lib/ts-codegen-naming.ts";
import { schemaSymbol } from "./zod-schema-names.ts";
import { validatorObjectEntries } from "./frontend-bindings-routes.ts";
import {
  sampleForComponent,
  nullableVariantForComponent,
  nullableFieldNames,
  enumerateComponentMutations,
} from "./component-fixture.ts";
import { serializeSampleValue as serializeValue } from "./sdk/codegen/lib/ts-sample-literal.ts";
import { fill } from "./common/fill.ts";
import { frontendTestHarnessPatch } from "./frontend-test-harness.ts";
import { validatorsTestTmpl } from "./frontend-validators-tests/resources.ts";
import type { GenerateEntry } from "./sdk/codegen/lib/generate-result.ts";
import type { GenerateArgs } from "./frontend-generate-types.ts";
import { makeGenerate } from "./sdk/codegen/lib/make-generate.ts";
import type { CodegenNames } from "./sdk/codegen-naming.ts";
import type { CodegenLayout } from "./sdk/codegen-layout.ts";

/** The validators fixtures feed zod at runtime: an ISO date-time string parses under both z.string() (string mode) and z.coerce.date() (native mode), so the tests stay settings-agnostic. */
const FIXTURE_DATETIME = "string";

const escapeForTestName = (s: string): string => s.replace(/"/g, '\\"');

const cloneFixture = (
  fx: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fx)) {
    out[k] = v instanceof Uint8Array ? new Uint8Array(v) : v;
  }
  return out;
};

type Components = Record<string, unknown>;

type CaseTok = {
  name: string;
  fixture: string;
  assertion: string;
};

interface SchemaCtx {
  names: CodegenNames;
  ident: (key: string) => string;
}

type TestFileCtx = SchemaCtx & { validatorsImport: string };

const closureNames = (closure: Set<string>, names: CodegenNames): string[] =>
  [...closure].sort((a, b) =>
    schemaSymbol(a, names).localeCompare(schemaSymbol(b, names)),
  );

const schemaCases = (
  name: string,
  components: Components,
  { names, ident }: SchemaCtx,
): CaseTok[] => {
  const opts = { datetime: FIXTURE_DATETIME, ident };
  const valid = sampleForComponent(name, components, opts);
  const cases: CaseTok[] = [
    {
      name: "parses a valid payload",
      fixture: serializeValue(valid),
      assertion: "not.toThrow",
    },
  ];
  if (nullableFieldNames(name, components, { ident }).length > 0) {
    cases.push({
      name: "accepts null for nullable fields",
      fixture: serializeValue(
        nullableVariantForComponent(name, components, opts),
      ),
      assertion: "not.toThrow",
    });
  }
  for (const m of enumerateComponentMutations(name, components, { ident })) {
    cases.push({
      name: `rejects when ${escapeForTestName(m.description)}`,
      fixture: serializeValue(m.mutate(cloneFixture(valid))),
      assertion: "toThrow",
    });
  }
  return cases;
};

const testFileContents = (
  closure: Set<string>,
  components: Components,
  ctx: TestFileCtx,
): string => {
  const ordered = closureNames(closure, ctx.names);
  return fill(validatorsTestTmpl, {
    symbols: ordered.map((name) => schemaSymbol(name, ctx.names)).join(", "),
    validatorsImport: ctx.validatorsImport,
    schemas: ordered.map((name) => ({
      schemaName: schemaSymbol(name, ctx.names),
      cases: schemaCases(name, components, ctx),
    })),
  });
};

/** Generate a `validators.test.ts` next to every object's `validators.ts` — one describe per zod schema that file exports, driven by the same route projection + reachable-component closure the validators generator uses, so the tests cover exactly the schemas that were generated. Each schema gets a valid-payload case, a nullable-fields case when it has any, and a rejecting case per invalid mutation (missing/null required, wrong scalar type). Adds the vitest + zod harness to frontend/package.json. */
const planFrontendValidatorsTests = async ({
  inputs,
  settings,
}: GenerateArgs) => {
  const names = namesForSettings(settings, "typescript");
  const fields = new CodegenFieldNames({ fieldFormat: names.fieldFormat });
  const ident = (key: string) => fields.ident(key);
  const entries: GenerateEntry[] = await validatorObjectEntries(
    { inputs, settings },
    { test: true },
    (
      closure: Set<string>,
      components: Components,
      {
        ds,
        entity,
        layout,
      }: { ds: string; entity: string; layout: CodegenLayout },
    ) =>
      testFileContents(closure, components, {
        names,
        ident,
        validatorsImport: layout.frontendRelImport(
          layout.frontendValidatorFile(ds, entity, { test: true }),
          layout.frontendValidatorFile(ds, entity),
        ),
      }),
  );
  if (entries.length > 0) {
    entries.push(frontendTestHarnessPatch({ needsZod: true }));
  }
  return entries;
};

export const generate = makeGenerate(planFrontendValidatorsTests);

export const assembleAfterStep = true;
