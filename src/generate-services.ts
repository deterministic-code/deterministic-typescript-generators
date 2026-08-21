import { toNative } from "./base-type-converter.ts";
import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  SERVICES_YAML,
  type CustomServiceEntry,
  type ServiceCandidate,
} from "@deterministic-code/generators-common/specification";
import { libraryImportSpecifier } from "./library-import.ts";
import { Emit } from "./emit.ts";
import {
  customStubTmpl,
  genericTmpl,
  indexTmpl,
} from "./resources/services.ts";

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    const { generics, customs } = deterministic.services;
    const entries: GenerateEntry[] = [
      ...generics.map((c) => this.generic(c)),
      ...customs.map((c) => this.custom(c)),
    ];
    if (this.settings.createIndex) {
      entries.push(...this.indexes(generics, customs));
    }
    return entries;
  }

  private generic(candidate: ServiceCandidate): GenerateEntry {
    const { simpleDoc, descriptionDoc, libraryReferenceMode } = this.settings;
    const typeName = this.casing.convertTypes(candidate.name);
    const className = this.casing.serviceClassName(candidate.name);
    const interfaceName = this.casing.serviceInterfaceName(candidate.name);
    const generatePath = this.imports.service(candidate.name);
    const typeImportPath = this.imports.spec(
      this.imports.serviceRel(candidate.name),
      candidate.kind === "datasource_type"
        ? this.imports.datasourceRel(candidate.name)
        : this.imports.viewRel(candidate.name),
    );
    const servicesImport = libraryImportSpecifier(
      "services",
      libraryReferenceMode,
      this.imports.serviceRel(candidate.name),
    );
    return content(
      generatePath,
      fill(genericTmpl, {
        simpleDoc,
        descriptionDoc,
        typeImport: true,
        typeName,
        typeImportPath,
        servicesImport,
        interfaceName,
        className,
        datasourceType: candidate.datasourceType ?? "standard",
        finders: candidate.byFields.map((bf) => ({
          method: this.casing.finderMethod(bf.field),
          param: this.casing.fieldIdent(bf.field),
          paramType: toNative(bf.type),
          field: this.casing.convertFields(bf.field),
          typeName,
        })),
      }),
    );
  }

  private custom(entry: CustomServiceEntry): GenerateEntry {
    const { simpleDoc, descriptionDoc } = this.settings;
    const className = entry.name;
    const interfaceName = this.casing.authoredInterfaceName(entry.name);
    return content(
      this.imports.serviceCustom(entry.name, entry.module),
      fill(customStubTmpl, {
        simpleDoc,
        descriptionDoc,
        interfaceName,
        className,
        hasMethods: entry.methods.length > 0,
        methods: entry.methods.map((name) => ({ name })),
      }),
    );
  }

  private indexes(
    generics: ServiceCandidate[],
    customs: CustomServiceEntry[],
  ): GenerateEntry[] {
    const entries: GenerateEntry[] = [];
    if (generics.length > 0) {
      const sorted = [...generics].sort((a, b) =>
        this.casing.serviceClassName(a.name).localeCompare(
          this.casing.serviceClassName(b.name),
        ),
      );
      const index = this.imports.index(this.imports.service(sorted[0]!.name));
      if (index) {
        entries.push(
          content(
            index,
            fill(indexTmpl, {
              types: sorted.map((c) => ({
                className: this.casing.serviceClassName(c.name),
                interfaceName: this.casing.serviceInterfaceName(c.name),
                fileBase: this.casing.fileBase(`${c.name}_service`),
              })),
            }),
          ),
        );
      }
    }
    const customDirEntries = customs.filter(
      (e) => !e.module || !e.module.startsWith("."),
    );
    if (customDirEntries.length > 0) {
      const sorted = [...customDirEntries].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const index = this.imports.index(this.imports.serviceCustom(sorted[0]!.name));
      if (index) {
        entries.push(
          content(
            index,
            fill(indexTmpl, {
              types: sorted.map((e) => ({
                className: e.name,
                interfaceName: this.casing.authoredInterfaceName(e.name),
                fileBase: this.casing.fileBase(e.name),
              })),
            }),
          ),
        );
      }
    }
    return entries;
  }
}

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(SERVICES_YAML);
  const generator = new Generator(ctx.settings);
  return generator.from(
    await DeterministicParser(ctx.reader).parse(ctx.settings, {
      serviceClassName: (entity) => generator.casing.serviceClassName(entity),
    }),
  );
};
