import type { SettingsDict } from "./generate-context.ts";

export const settingsStr = (
  settings: SettingsDict,
  key: string,
): string | undefined => settings[key];

export const settingsBool = (
  settings: SettingsDict,
  key: string,
): boolean => settings[key] === "true";

/** CSV value at `key`, trimmed and empty-dropped; `[]` when absent. */
export const settingsList = (
  settings: SettingsDict,
  key: string,
): string[] => {
  const raw = settings[key];
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};
