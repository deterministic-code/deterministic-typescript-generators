import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { parseGenericRouteSpecs, type GenericRouteSpec } from './parseRouteSpecs';

export async function loadRoutesYaml(yamlPath: string): Promise<unknown> {
  return yaml.load(await readFile(yamlPath, 'utf8'));
}

export async function loadGenericRouteSpecs(yamlPath: string): Promise<GenericRouteSpec[]> {
  return parseGenericRouteSpecs(await loadRoutesYaml(yamlPath));
}
