import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { parseServiceSpecs } from './parseServiceSpecs';
import type { ServiceSpec } from '../services/types';

export async function loadServiceSpecs(yamlPath: string): Promise<ServiceSpec[]> {
  return parseServiceSpecs(yaml.load(await readFile(yamlPath, 'utf8')));
}
