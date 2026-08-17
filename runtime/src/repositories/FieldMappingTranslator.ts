import type { EntityFieldMap } from './parseFieldMappings';

export class FieldMappingTranslator {
  private readonly logicalToPhysical: ReadonlyMap<string, string>;
  private readonly physicalToLogical: ReadonlyMap<string, string>;
  readonly hasMappings: boolean;

  constructor(entityMap: EntityFieldMap | undefined) {
    if (!entityMap || entityMap.size === 0) {
      this.logicalToPhysical = new Map();
      this.physicalToLogical = new Map();
      this.hasMappings = false;
      return;
    }
    const reverse = new Map<string, string>();
    for (const [logical, physical] of entityMap) {
      if (reverse.has(physical)) {
        throw new Error(
          `FieldMappingTranslator: physical column '${physical}' is mapped from multiple logical columns ('${reverse.get(physical)}' and '${logical}')`,
        );
      }
      reverse.set(physical, logical);
    }
    this.logicalToPhysical = entityMap;
    this.physicalToLogical = reverse;
    this.hasMappings = true;
  }

  toPhysical(logical: string): string {
    return this.logicalToPhysical.get(logical) ?? logical;
  }

  toLogical(physical: string): string {
    return this.physicalToLogical.get(physical) ?? physical;
  }

  toPhysicalRow<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
    if (!this.hasMappings) return row;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[this.toPhysical(k)] = v;
    }
    return out;
  }

  toLogicalRow<T extends Record<string, unknown>>(row: T): T {
    if (!this.hasMappings) return row;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[this.toLogical(k)] = v;
    }
    return out as T;
  }
}
