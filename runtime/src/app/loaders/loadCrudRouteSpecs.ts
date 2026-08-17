import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { parseCrudRouteSpecs, type CrudRouteSpec } from './parseCrudRouteSpecs';
import type { StandardIdType } from '../../repositories/standardFieldConverting';

export async function loadCrudRouteSpecs(
  datasourceYamlPath: string,
  routesYamlPath: string,
  opts: { projectIdType: StandardIdType; viewTypesYamlPath?: string },
): Promise<CrudRouteSpec[]> {
  const [datasourceDoc, routesDoc, viewTypesDoc] = await Promise.all([
    readFile(datasourceYamlPath, 'utf8').then((s) => yaml.load(s)),
    readFile(routesYamlPath, 'utf8').then((s) => yaml.load(s)),
    opts.viewTypesYamlPath
      ? readFile(opts.viewTypesYamlPath, 'utf8').then((s) => yaml.load(s))
      : Promise.resolve(undefined),
  ]);
  return parseCrudRouteSpecs(datasourceDoc, routesDoc, {
    projectIdType: opts.projectIdType,
    viewTypesDoc,
  });
}
