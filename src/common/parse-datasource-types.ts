import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { referenceFieldShape } from "./datasource-settings.ts";
import { pathExists } from "./path-exists.ts";

export type DatasourceField = {
  name: string;
  type: string;
  isNullable: boolean;
  references?: unknown;
};

export type EntityDef = {
  datasource_type?: string;
  skip_migrations?: boolean;
  fields?: Array<
    Record<
      string,
      {
        type?: string;
        is_nullable?: boolean;
        references?: unknown;
        primary_key?: boolean;
      }
    >
  >;
};

export type DatasourceTable = {
  name: string;
  datasourceType?: string;
  fields: DatasourceField[];
  def: EntityDef;
};

const entryOf = <T>(obj: Record<string, T>) => Object.entries(obj)[0];

export const loadDatasourceTables = async (args: {
  inputDir: string;
  idType: string;
}): Promise<DatasourceTable[]> => {
  const yamlPath = join(args.inputDir, "datasource_types.yaml");
  if (!(await pathExists(yamlPath))) {
    throw new Error(
      `generate-datasource-types: missing datasource_types.yaml in ${args.inputDir}`,
    );
  }
  const types =
    (parse(await readFile(yamlPath, "utf8")) as {
      types?: Array<Record<string, EntityDef>>;
    } | null)?.types ?? [];
  const list = Array.isArray(types) ? types : [];
  const byName = new Map(
    list.flatMap((e) => {
      const p = entryOf(e);
      return p ? [p] : [];
    }),
  );
  const refType = (references: unknown): string | undefined => {
    const parts = String(references).split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
    const parent = byName.get(parts[0]);
    if (!parent) return undefined;
    const pk = (parent.fields ?? [])
      .map(entryOf)
      .find((p) => p?.[1].primary_key);
    if (pk) return pk[0] === parts[1] ? pk[1].type : undefined;
    return parts[1] === "id"
      ? referenceFieldShape(args.idType).type
      : undefined;
  };
  return list.map((entry) => {
    const [name, def] = entryOf(entry)!;
    return {
      name,
      datasourceType: def.datasource_type,
      def,
      fields: (def.fields ?? []).map((f) => {
        const [fname, fdef] = entryOf(f)!;
        let type = fdef.type;
        if (type === undefined && fdef.references) {
          type = refType(fdef.references);
          if (!type) {
            throw new Error(
              `invariant: type-less reference "${fname}" -> "${fdef.references}" has no resolvable parent primary key`,
            );
          }
        }
        return {
          name: fname,
          type: type ?? "string",
          isNullable: fdef.is_nullable === true,
          references: fdef.references,
        };
      }),
    };
  });
};
