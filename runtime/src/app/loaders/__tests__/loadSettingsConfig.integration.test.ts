import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseSettingsConfig, loadSettingsConfig } from '../loadSettingsConfig';

describe('parseSettingsConfig — id_type is required (no default)', () => {
  it('throws when input is null', () => {
    expect(() => parseSettingsConfig(null)).toThrow(/id_type' is required/);
  });

  it('throws when input is undefined', () => {
    expect(() => parseSettingsConfig(undefined)).toThrow(/id_type' is required/);
  });

  it('throws when the file has no settings block', () => {
    expect(() => parseSettingsConfig({})).toThrow(/id_type' is required/);
  });

  it('throws when settings has no datasource block', () => {
    expect(() => parseSettingsConfig({ settings: {} })).toThrow(/id_type' is required/);
  });

  it('throws when datasource omits id_type', () => {
    expect(() => parseSettingsConfig({ settings: { datasource: {} } })).toThrow(
      /id_type' is required/,
    );
  });

  it('throws when only pluralize is set but id_type is absent', () => {
    expect(() =>
      parseSettingsConfig({ settings: { datasource: { pluralize_datatable_names: true } } }),
    ).toThrow(/id_type' is required/);
  });
});

describe('parseSettingsConfig — explicit values', () => {
  it('returns pluralizeTableNames: true when the flag is explicitly true', () => {
    expect(
      parseSettingsConfig({
        settings: { datasource: { pluralize_datatable_names: true, id_type: 'integer' } },
      }),
    ).toEqual({ pluralizeTableNames: true, datetime: 'native', uuid: 'native', idType: 'integer' });
  });

  it('returns pluralizeTableNames: false when the flag is explicitly false', () => {
    expect(
      parseSettingsConfig({
        settings: { datasource: { pluralize_datatable_names: false, id_type: 'integer' } },
      }),
    ).toEqual({
      pluralizeTableNames: false,
      datetime: 'native',
      uuid: 'native',
      idType: 'integer',
    });
  });

  it('reads datetime and uuid representation from the datasource block', () => {
    expect(
      parseSettingsConfig({
        settings: { datasource: { datetime: 'string', uuid: 'string', id_type: 'integer' } },
      }),
    ).toEqual({
      pluralizeTableNames: true,
      datetime: 'string',
      uuid: 'string',
      idType: 'integer',
    });
  });

  it('reads id_type: uuid from the datasource block', () => {
    expect(parseSettingsConfig({ settings: { datasource: { id_type: 'uuid' } } }).idType).toBe(
      'uuid',
    );
  });
});

describe('parseSettingsConfig — strict validation (GATE 16)', () => {
  it('throws when top level is a primitive', () => {
    expect(() => parseSettingsConfig('not-an-object' as never)).toThrow(
      /expected top-level mapping/,
    );
  });

  it('throws when settings is a null', () => {
    expect(() => parseSettingsConfig({ settings: null })).toThrow(/'settings' to be a mapping/);
  });

  it('throws when settings is a primitive', () => {
    expect(() => parseSettingsConfig({ settings: 'oops' as never })).toThrow(
      /'settings' to be a mapping/,
    );
  });

  it('throws when datasource is null', () => {
    expect(() => parseSettingsConfig({ settings: { datasource: null } })).toThrow(
      /'settings.datasource' to be a mapping/,
    );
  });

  it('throws when datasource is a primitive', () => {
    expect(() => parseSettingsConfig({ settings: { datasource: 'oops' as never } })).toThrow(
      /'settings.datasource' to be a mapping/,
    );
  });

  it('throws when pluralize_datatable_names is a string (typo)', () => {
    expect(() =>
      parseSettingsConfig({
        settings: { datasource: { id_type: 'integer', pluralize_datatable_names: 'false' } },
      }),
    ).toThrow(/'settings.datasource.pluralize_datatable_names' must be a boolean/);
  });

  it('throws when pluralize_datatable_names is a number', () => {
    expect(() =>
      parseSettingsConfig({
        settings: { datasource: { id_type: 'integer', pluralize_datatable_names: 0 } },
      }),
    ).toThrow(/must be a boolean/);
  });

  it('throws when pluralize_datatable_names is null', () => {
    expect(() =>
      parseSettingsConfig({
        settings: { datasource: { id_type: 'integer', pluralize_datatable_names: null } },
      }),
    ).toThrow(/must be a boolean/);
  });

  it('throws when datetime is neither native nor string', () => {
    expect(() =>
      parseSettingsConfig({
        settings: { datasource: { datetime: 'iso' } },
      }),
    ).toThrow(/'settings.datasource.datetime' must be 'native' or 'string'/);
  });

  it('throws when uuid is neither native nor string', () => {
    expect(() =>
      parseSettingsConfig({
        settings: { datasource: { uuid: true } },
      }),
    ).toThrow(/'settings.datasource.uuid' must be 'native' or 'string'/);
  });

  it('throws when id_type is not a known id type', () => {
    expect(() =>
      parseSettingsConfig({
        settings: { datasource: { id_type: 'guid' } },
      }),
    ).toThrow(/'settings.datasource.id_type' must be one of/);
  });
});

describe('loadSettingsConfig — file I/O', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-config-'));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws when the file does not exist', async () => {
    await expect(loadSettingsConfig(path.join(dir, 'absent.yaml'))).rejects.toThrow(
      /settings\.yaml not found/,
    );
  });

  it('reads pluralize_datatable_names: false from a real YAML file', async () => {
    const yamlPath = path.join(dir, 'settings-false.yaml');
    await fs.writeFile(
      yamlPath,
      'settings:\n  datasource:\n    id_type: integer\n    pluralize_datatable_names: false\n',
    );
    const cfg = await loadSettingsConfig(yamlPath);
    expect(cfg).toEqual({
      pluralizeTableNames: false,
      datetime: 'native',
      uuid: 'native',
      idType: 'integer',
    });
  });

  it('reads pluralize_datatable_names: true from a real YAML file', async () => {
    const yamlPath = path.join(dir, 'settings-true.yaml');
    await fs.writeFile(
      yamlPath,
      'settings:\n  datasource:\n    id_type: integer\n    pluralize_datatable_names: true\n',
    );
    const cfg = await loadSettingsConfig(yamlPath);
    expect(cfg).toEqual({
      pluralizeTableNames: true,
      datetime: 'native',
      uuid: 'native',
      idType: 'integer',
    });
  });

  it('throws when the YAML omits settings.datasource.id_type', async () => {
    const yamlPath = path.join(dir, 'settings-empty.yaml');
    await fs.writeFile(yamlPath, 'other: stuff\n');
    await expect(loadSettingsConfig(yamlPath)).rejects.toThrow(/id_type' is required/);
  });
});
