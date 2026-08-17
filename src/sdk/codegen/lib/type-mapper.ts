import {
  loadFieldTypeCatalog,
  languageTypeMap,
} from "../../lib/field-type-catalog.ts";
import { fieldConverter } from "../../../field-converter.ts";

const CATALOG = await loadFieldTypeCatalog();

export function createTypeMapper(language: string) {
  if (language !== "typescript") {
    throw new Error(`createTypeMapper: unsupported language '${language}'`);
  }
  const stringDatetime = fieldConverter.datetimeStringType;
  const byAbstract = languageTypeMap(CATALOG, language);
  return function mapType(
    dsType: string,
    { datetime = "native" }: { datetime?: string } = {},
  ): string {
    if (dsType === "datetime" && datetime === "string") return stringDatetime;
    const mapped = byAbstract.get(dsType);
    if (mapped === undefined) {
      throw new Error(`Unknown field type: ${dsType}`);
    }
    return mapped;
  };
}
