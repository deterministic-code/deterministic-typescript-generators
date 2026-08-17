import { toCase, type CaseFormat } from "./case.ts";

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Casing-aware deriver of field/member identifiers (fieldFormat), plus safe-identifier quoting for generated object keys. Class/file names live in `CodegenNames`; placement in `CodegenLayout`. */
export class CodegenFieldNames {
  fieldFormat: CaseFormat;

  constructor({ fieldFormat }: { fieldFormat: CaseFormat }) {
    this.fieldFormat = fieldFormat;
  }

  /** The cased field/member name for a column. */
  name(field: string): string {
    return toCase(field, this.fieldFormat);
  }

  /** The cased name as a safe object-key identifier (quoted when not a bare identifier). */
  ident(field: string): string {
    const name = this.name(field);
    return IDENT_RE.test(name) ? name : JSON.stringify(name);
  }
}
