const PATCH_PLAN_HINT = "see PATCH_PLAN in create-migrate-scripts.mjs";

const tsBegin = (id: string): string =>
  `// === BEGIN ${id} — ${PATCH_PLAN_HINT} ===`;

const tsEnd = (id: string): string => `// === END ${id} ===`;

const shBegin = (id: string): string =>
  `# === BEGIN ${id} — ${PATCH_PLAN_HINT} ===`;

const shEnd = (id: string): string => `# === END ${id} ===`;

interface SectionMarker {
  style: string;
  start: string;
  end: string;
}

/** Patch-region markers owned by the TypeScript generator pack. */
export const SECTION_MARKERS = {
  APP_DB_IMPORTS: {
    style: "ts",
    start: tsBegin("APP_DB_IMPORTS"),
    end: tsEnd("APP_DB_IMPORTS"),
  },
  APP_BEFORE_HOOK: {
    style: "ts",
    start: tsBegin("APP_BEFORE_HOOK"),
    end: tsEnd("APP_BEFORE_HOOK"),
  },
  APP_AFTER_HOOK: {
    style: "ts",
    start: tsBegin("APP_AFTER_HOOK"),
    end: tsEnd("APP_AFTER_HOOK"),
  },
  MIGRATE_HOOK: {
    style: "sh",
    start: shBegin("MIGRATE_HOOK"),
    end: shEnd("MIGRATE_HOOK"),
  },
  APK_CLIENTS: {
    style: "sh",
    start: shBegin("APK_CLIENTS"),
    end: shEnd("APK_CLIENTS"),
  },
  MIGRATE_COPY: {
    style: "sh",
    start: shBegin("MIGRATE_COPY"),
    end: shEnd("MIGRATE_COPY"),
  },
} satisfies Record<string, SectionMarker>;
