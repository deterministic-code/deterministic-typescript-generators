export const referencesBackend = (settings: Record<string, string>): boolean =>
  settings.reference_backend_type === "true";
