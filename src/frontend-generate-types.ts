export type { GenerateContext as GenerateArgs } from "@deterministic-code/generators-common/generate-context";

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
