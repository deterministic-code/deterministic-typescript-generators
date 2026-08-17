export type SupportedDatasource = 'sqlite' | 'mysql' | 'postgres';
export type SupportedLanguage = 'typescript';

export interface ITypeFieldConverter<DBValue = unknown, LangValue = unknown> {
  readonly fromDatasource: SupportedDatasource;
  readonly toLanguage: SupportedLanguage;
  readonly datasourceType: string;
  from(value: DBValue | null): LangValue | null;
  to(value: LangValue | null): DBValue | null;
}
