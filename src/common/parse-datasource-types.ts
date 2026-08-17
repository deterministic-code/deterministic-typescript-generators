import { parse } from "yaml";
import { referenceFieldShape } from "./datasource-settings.ts";
import { isRecord, namedEntries } from "./yaml-entry.ts";

export type DatasourceField = {
  name: string;
  type: string;
  isNullable: boolean;
  references?: string;
  isPrimaryKey?: boolean;
  minSize?: number;
  size?: number;
  /** Present when the YAML author set `default_value` (including `null`). */
  hasDefault?: boolean;
  defaultValue?: string | number | boolean | null;
};

export type DatasourceType = {
  name: string;
  datasourceType: string;
  fields: DatasourceField[];
};

export const DATASOURCE_TYPES_YAML = "datasource_types.yaml";

type YamlField = {
  name: string;
  type?: string;
  isNullable: boolean;
  references?: string;
  isPrimaryKey: boolean;
  minSize?: number;
  size?: number;
  hasDefault: boolean;
  defaultValue?: string | number | boolean | null;
};

type YamlType = {
  name: string;
  datasourceType?: string;
  fields: YamlField[];
};

const rec = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asDefaultValue = (
  value: unknown,
): string | number | boolean | null | undefined => {
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return undefined;
};

const inheritedType = (
  references: string,
  byName: Map<string, YamlType>,
  idType: string,
): string | undefined => {
  const [parentName, column, extra] = references.split(".");
  if (extra !== undefined || !parentName || !column) return undefined;
  const parent = byName.get(parentName);
  if (parent === undefined) return undefined;
  const pk = parent.fields.find((f) => f.isPrimaryKey);
  if (pk !== undefined) return pk.name === column ? pk.type : undefined;
  return column === "id" ? referenceFieldShape(idType).type : undefined;
};

const fieldType = (
  field: YamlField,
  byName: Map<string, YamlType>,
  idType: string,
): string => {
  if (field.type !== undefined) return field.type;
  if (field.references === undefined) return "string";
  const type = inheritedType(field.references, byName, idType);
  if (type === undefined) {
    throw new Error(
      `invariant: type-less reference "${field.name}" -> "${field.references}" has no resolvable parent primary key`,
    );
  }
  return type;
};

export const parseDatasourceTypes = (args: {
  yaml: string;
  idType: string;
}): DatasourceType[] => {
  const types: YamlType[] = namedEntries(rec(parse(args.yaml)).types).map(
    ([name, body]) => {
      const raw = rec(body);
      return {
        name,
        datasourceType: str(raw.datasource_type),
        fields: namedEntries(raw.fields).map(([fname, fbody]) => {
          const f = rec(fbody);
          const hasDefault = Object.prototype.hasOwnProperty.call(
            f,
            "default_value",
          );
          return {
            name: fname,
            type: str(f.type),
            isNullable: f.is_nullable === true,
            references: str(f.references),
            isPrimaryKey: f.primary_key === true,
            minSize:
              typeof f.min_size === "number" && Number.isFinite(f.min_size)
                ? f.min_size
                : undefined,
            size:
              typeof f.size === "number" && Number.isFinite(f.size)
                ? f.size
                : undefined,
            hasDefault,
            defaultValue: hasDefault ? asDefaultValue(f.default_value) : undefined,
          };
        }),
      };
    },
  );
  const byName = new Map(types.map((t) => [t.name, t]));
  return types.map((t) => ({
    name: t.name,
    datasourceType: t.datasourceType ?? "standard",
    fields: t.fields.map((field) => ({
      name: field.name,
      type: fieldType(field, byName, args.idType),
      isNullable: field.isNullable,
      references: field.references,
      ...(field.isPrimaryKey ? { isPrimaryKey: true } : {}),
      ...(field.minSize !== undefined ? { minSize: field.minSize } : {}),
      ...(field.size !== undefined ? { size: field.size } : {}),
      ...(field.hasDefault
        ? { hasDefault: true, defaultValue: field.defaultValue }
        : {}),
    })),
  }));
};
