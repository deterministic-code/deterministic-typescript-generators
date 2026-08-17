import type { SettingsDict } from "./generate-context.ts";
import { settingsStr } from "./settings.ts";
import { toNative } from "./type-converter.ts";

/** `datasource.id_type` → TypeScript type for `id` and uuid-id foreign keys. */
const ID_TO: Record<string, string> = {
  integer: toNative("number"),
  biginteger: "bigint",
  uuid: toNative("uuid"),
  string: toNative("string"),
};

/** `datasource.id_type` → spec field shape a type-less `references: X.id` inherits. */
const REFERENCE_SHAPE: Record<
  string,
  { type: string; size: number | undefined }
> = {
  integer: { type: "number", size: undefined },
  biginteger: { type: "biginteger", size: undefined },
  uuid: { type: "uuid", size: undefined },
  string: { type: "string", size: 64 },
};

export type DatasourceSettings = {
  idType: string;
  datetimeRepr: string;
  withUuidColumn: boolean;
  tsIdType: string;
  datetimeType: string;
};

export const datasourceSettings = (
  settings: SettingsDict,
): DatasourceSettings => {
  const idType = settingsStr(settings, "datasource.id_type") ?? "integer";
  const datetimeRepr = settingsStr(settings, "datasource.datetime") ?? "native";
  return {
    idType,
    datetimeRepr,
    withUuidColumn: idType !== "uuid",
    tsIdType: ID_TO[idType] ?? toNative("number"),
    datetimeType:
      datetimeRepr === "string" ? toNative("string") : toNative("datetime"),
  };
};

export const referenceIsUuid = (
  ds: DatasourceSettings,
  references: string | undefined,
): boolean =>
  ds.idType === "uuid" &&
  references !== undefined &&
  references.split(".")[1] === "id";

export const nativeFieldType = (
  ds: DatasourceSettings,
  field: { type: string; references?: string },
): string =>
  referenceIsUuid(ds, field.references)
    ? ds.tsIdType
    : toNative(
        field.type === "datetime" && ds.datetimeRepr === "string"
          ? "string"
          : field.type,
      );

export const referenceFieldShape = (
  idType: string,
): { type: string; size: number | undefined } =>
  REFERENCE_SHAPE[idType] ?? REFERENCE_SHAPE.integer;
