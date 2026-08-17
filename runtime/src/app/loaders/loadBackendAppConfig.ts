import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { parseBackendAppConfig, type BackendAppConfig } from './parseBackendAppConfig';

export async function loadBackendAppConfig(yamlPath: string): Promise<BackendAppConfig> {
  return parseBackendAppConfig(yaml.load(await readFile(yamlPath, 'utf8')));
}
