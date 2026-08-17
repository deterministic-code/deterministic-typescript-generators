import { CodegenFieldNames } from "@deterministic-code/generator-sdk/field-names";
import { namesForSettings } from "@deterministic-code/generator-sdk/codegen/lib/ts-codegen-naming";
import { schemaSymbol } from "./zod-schema-names.ts";
import { validatorObjectEntries } from "./frontend-bindings-routes.ts";
import {
  sampleForComponent,
  nullableVariantForComponent,
  nullableFieldNames,
  enumerateComponentMutations,
} from "./component-fixture.ts";
import {
  cloneFixture,
  renderMutationCase,
  renderNullableVariantCase,
  renderValidCase,
} from "./zod-test-cases.ts";
import { frontendTestHarnessPatch } from "./frontend-test-harness.ts";
import type { EmitEntry } from "@deterministic-code/generator-sdk/codegen/lib/emit-result";
import type { EmitArgs } from "./frontend-emit-types.ts";
import type { CodegenNames } from "@deterministic-code/generator-sdk/codegen-naming";
import type { CodegenLayout } from "@deterministic-code/generator-sdk/codegen-layout";

/** The validators fixtures feed zod at runtime: an ISO date-time string parses under both z.string() (string mode) and z.coerce.date() (native mode), so the tests stay settings-agnostic. */
const FIXTURE_DATETIME = "string";

type Components = Record<string, unknown>;

interface SchemaCtx {
  names: CodegenNames;
  ident: (key: string) => string;
}

type TestFileCtx = SchemaCtx & { validatorsImport: string };

function closureNames(closure: Set<string>, names: CodegenNames): string[] {
  return [...closure].sort((a, b) =>
    schemaSymbol(a, names).localeCompare(schemaSymbol(b, names)),
  );
}

function schemaCases(
  name: string,
  components: Components,
  { names, ident }: SchemaCtx,
): string {
  const symbol = schemaSymbol(name, names);
  const opts = { datetime: FIXTURE_DATETIME, ident };
  const valid = sampleForComponent(name, components, opts);
  const cases = [renderValidCase(symbol, valid)];
  if (nullableFieldNames(name, components, { ident }).length > 0) {
    cases.push(
      renderNullableVariantCase(
        symbol,
        nullableVariantForComponent(name, components, opts),
      ),
    );
  }
  for (const m of enumerateComponentMutations(name, components, { ident })) {
    cases.push(
      renderMutationCase(symbol, m.description, m.mutate(cloneFixture(valid))),
    );
  }
  return `describe("${symbol} (frontend validators)", () => {\n${cases.join("\n\n")}\n});\n`;
}

function testFileContents(
  closure: Set<string>,
  components: Components,
  ctx: TestFileCtx,
): string {
  const ordered = closureNames(closure, ctx.names);
  const symbols = ordered
    .map((name) => schemaSymbol(name, ctx.names))
    .join(", ");
  const header = [
    `import { describe, it, expect } from "vitest";`,
    `import { ${symbols} } from "${ctx.validatorsImport}";`,
  ].join("\n");
  const bodies = ordered.map((name) => schemaCases(name, components, ctx));
  return `${header}\n\n${bodies.join("\n")}`;
}

/** Emit a `validators.test.ts` next to every object's `validators.ts` — one describe per zod schema that file exports, driven by the same route projection + reachable-component closure the validators emitter uses, so the tests cover exactly the schemas that were emitted. Each schema gets a valid-payload case, a nullable-fields case when it has any, and a rejecting case per invalid mutation (missing/null required, wrong scalar type). Adds the vitest + zod harness to frontend/package.json. */
export async function emit({ inputs, settings }: EmitArgs) {
  const names = namesForSettings(settings, "typescript");
  const fields = new CodegenFieldNames({ fieldFormat: names.fieldFormat });
  const ident = (key: string) => fields.ident(key);
  const entries: EmitEntry[] = await validatorObjectEntries(
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
  return { entries };
}

export const entriesNative = true;

export const assembleAfterStep = true;
