/** Flat settings the generate runner passes every lane (dotted keys, string values). */
export type SettingsDict = Record<string, string>;

export type GenerateInputs = {
  dir: string;
};

export type GenerateContext = {
  inputs: GenerateInputs;
  settings: SettingsDict;
};
