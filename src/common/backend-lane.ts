/** Trailing-slashed prefix for per-language backend output (`""` when flat). Combined generation nests under `backend/`; multi-language nests under `<lang>/`. */
export const backendLaneDir = ({
  combined = false,
  multiLanguage = false,
  language,
}: {
  combined?: boolean;
  multiLanguage?: boolean;
  language: string;
}): string => {
  const parts: string[] = [];
  if (combined) parts.push("backend");
  if (multiLanguage) parts.push(language);
  return parts.length > 0 ? `${parts.join("/")}/` : "";
};
