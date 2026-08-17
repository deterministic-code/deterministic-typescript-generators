import type { SettingsDict } from "./sdk/settings-dict.ts";

/** The `{ inputs, settings }` argument every bindings-driven frontend generator's `generate` receives — `inputs` is the untyped codegen input adapter, `settings` the flat `SettingsDict` the naming bridges read. */
export type GenerateArgs = { inputs: unknown; settings: SettingsDict };

/** An OpenAPI `components/schemas` node as the frontend generators read it: a scalar (`type`/`format`), a `$ref`, a `oneOf` union, an `array` with `items`, or an object with `properties`. Validators additionally read `required`, `maxLength`, and `x-references`; every field is optional so both the types and validators lanes share one shape. */
export interface SchemaProp {
  type?: string;
  format?: string;
  $ref?: string;
  oneOf?: SchemaProp[];
  items?: SchemaProp;
  enum?: unknown[];
  nullable?: boolean;
  properties?: Record<string, SchemaProp>;
  required?: string[];
  maxLength?: number;
  "x-references"?: unknown;
}
