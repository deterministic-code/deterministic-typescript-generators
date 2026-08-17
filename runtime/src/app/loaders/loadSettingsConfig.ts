import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { pathExists } from '../../repositories/pathExists';

type DatasourceRepr = 'native' | 'string';
type IdType = 'integer' | 'biginteger' | 'uuid' | 'string';
const ID_TYPES: readonly IdType[] = ['integer', 'biginteger', 'uuid', 'string'];

export interface SettingsConfig {
  pluralizeTableNames: boolean;
  datetime?: DatasourceRepr;
  uuid?: DatasourceRepr;
  /** The project-wide primary-key representation (`settings.datasource.id_type`). Required — no default; a custom `primary_key` field overrides it per entity. */
  idType: IdType;
}

type ReprDefaults = {
  pluralizeTableNames: boolean;
  datetime: DatasourceRepr;
  uuid: DatasourceRepr;
};

const REPR_DEFAULTS: ReprDefaults = {
  pluralizeTableNames: true,
  datetime: 'native',
  uuid: 'native',
};

const MISSING_ID_TYPE =
  "settings.yaml: 'settings.datasource.id_type' is required — the project id_type has no default; declare it (integer | biginteger | uuid | string)";

/** The project id_type, asserted present. Throws rather than defaulting so a settings file that omits `id_type` surfaces at boot instead of silently becoming integer. */
function requireIdType(datasource: Record<string, unknown>): IdType {
  const raw = datasource.id_type;
  if (raw === undefined) {
    throw new Error(MISSING_ID_TYPE);
  }
  if (!ID_TYPES.includes(raw as IdType)) {
    throw new Error(
      `settings.yaml: 'settings.datasource.id_type' must be one of ${ID_TYPES.join(', ')}, got ${JSON.stringify(raw)}`,
    );
  }
  return raw as IdType;
}

function readReprSetting(
  datasource: Record<string, unknown>,
  key: 'datetime' | 'uuid',
): DatasourceRepr {
  const raw = datasource[key];
  if (raw === undefined) return REPR_DEFAULTS[key];
  if (raw !== 'native' && raw !== 'string') {
    throw new Error(
      `settings.yaml: 'settings.datasource.${key}' must be 'native' or 'string', got ${typeof raw} (${JSON.stringify(raw)})`,
    );
  }
  return raw;
}

function readDatasourceMapping(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') {
    throw new Error(`settings.yaml: expected top-level mapping, got ${typeof raw}`);
  }
  const settings = (raw as { settings?: unknown }).settings;
  if (settings === undefined) return null;
  if (settings === null || typeof settings !== 'object') {
    throw new Error(
      `settings.yaml: expected 'settings' to be a mapping, got ${settings === null ? 'null' : typeof settings}`,
    );
  }
  const datasource = (settings as { datasource?: unknown }).datasource;
  if (datasource === undefined) return null;
  if (datasource === null || typeof datasource !== 'object') {
    throw new Error(
      `settings.yaml: expected 'settings.datasource' to be a mapping, got ${datasource === null ? 'null' : typeof datasource}`,
    );
  }
  return datasource as Record<string, unknown>;
}

export function parseSettingsConfig(raw: unknown): SettingsConfig {
  const ds = readDatasourceMapping(raw);
  if (!ds) {
    throw new Error(MISSING_ID_TYPE);
  }
  const datetime = readReprSetting(ds, 'datetime');
  const uuid = readReprSetting(ds, 'uuid');
  const idType = requireIdType(ds);
  const flag = ds.pluralize_datatable_names;
  if (flag === undefined) return { ...REPR_DEFAULTS, datetime, uuid, idType };
  if (typeof flag !== 'boolean') {
    throw new Error(
      `settings.yaml: 'settings.datasource.pluralize_datatable_names' must be a boolean, got ${typeof flag} (${JSON.stringify(flag)})`,
    );
  }
  return { pluralizeTableNames: flag, datetime, uuid, idType };
}

export async function loadSettingsConfig(yamlPath: string): Promise<SettingsConfig> {
  if (!(await pathExists(yamlPath))) {
    throw new Error(`settings.yaml not found at ${yamlPath}: ${MISSING_ID_TYPE}`);
  }
  return parseSettingsConfig(yaml.load(await readFile(yamlPath, 'utf8')));
}
