export interface JsonSchema {
  $ref?: string;
  type?: string;
  format?: string;
  nullable?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
}

export interface SchemaComponents {
  components?: { schemas?: Record<string, JsonSchema> };
}

const REF_PREFIX = '#/components/schemas/';

/** The component name a `$ref` points at, or undefined when the schema is inline. */
export function schemaRefName(schema: JsonSchema): string | undefined {
  return schema.$ref?.startsWith(REF_PREFIX) ? schema.$ref.slice(REF_PREFIX.length) : undefined;
}

function resolveRef(ref: string, document: SchemaComponents): JsonSchema {
  if (!ref.startsWith(REF_PREFIX)) {
    throw new Error(`invariant: unsupported $ref '${ref}' (only ${REF_PREFIX}* is resolvable)`);
  }
  const name = ref.slice(REF_PREFIX.length);
  const target = document.components?.schemas?.[name];
  if (!target) {
    throw new Error(`invariant: $ref '${ref}' has no matching component schema`);
  }
  return target;
}

const FORMAT_SAMPLES: Record<string, string> = {
  uuid: '00000000-0000-0000-0000-000000000000',
  'date-time': '1970-01-01T00:00:00Z',
  date: '1970-01-01',
};

function scalarExample(schema: JsonSchema): unknown {
  switch (schema.type) {
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return schema.format ? (FORMAT_SAMPLES[schema.format] ?? 'string') : 'string';
  }
}

/**
 * Builds a placeholder-valued example payload from an OpenAPI JSON Schema,
 * dereferencing `$ref`s against `document.components.schemas` as it descends.
 * Pure and I/O-free so the binding preview can run it in the browser. `seen`
 * guards against a schema that refers back to itself through a `$ref` cycle.
 */
export function buildExample(
  schema: JsonSchema,
  document: SchemaComponents,
  seen: ReadonlySet<string> = new Set(),
): unknown {
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return null;
    return buildExample(
      resolveRef(schema.$ref, document),
      document,
      new Set(seen).add(schema.$ref),
    );
  }
  if (schema.nullable) return null;
  if (schema.type === 'array') {
    return schema.items ? [buildExample(schema.items, document, seen)] : [];
  }
  if (schema.type === 'object' || schema.properties) {
    const example: Record<string, unknown> = {};
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      example[name] = buildExample(property, document, seen);
    }
    return example;
  }
  return scalarExample(schema);
}
