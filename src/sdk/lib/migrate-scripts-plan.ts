import { CONTAINER_SQL_ROOT } from "../codegen-layout.ts";
import { DIALECT_DRIVER_PACKAGES, type SqlDialect } from "./generate-sql.ts";

interface PatchSection {
  id: string;
}

interface PatchPlanEntry {
  path: string;
  kind: string;
  sections?: PatchSection[];
  ownedKeys?: string[];
}

interface DialectDriver {
  name: string;
  version: string;
  installScripts: boolean;
}

/** apk packages that need to land in the runtime image so the per-dialect client binary is available; oracle/sqlserver bundle their driver into node_modules. */
export const DIALECT_APK_CLIENTS: Record<string, string> = {
  sqlite: "sqlite",
  postgres: "postgresql-client",
  mysql: "mysql-client",
};

export function dialectDriver(dialect: string): DialectDriver | null {
  const entry = DIALECT_DRIVER_PACKAGES[dialect as SqlDialect];
  if (!entry) return null;
  return {
    name: entry.name,
    version: entry.version,
    installScripts: entry.installScripts === true,
  };
}

function pickDefaultDialect(dialects: string[]): string {
  return dialects.includes("sqlite") ? "sqlite" : dialects[0];
}

export function dbEnvContent(dialects: string[]): string {
  const list = dialects.length > 0 ? dialects : ["sqlite"];
  const def = pickDefaultDialect(list);
  const lines = [`DATABASE_BACKEND=${def}`];
  if (def === "sqlite") {
    lines.push("DB_PATH=./dev.sqlite");
  } else {
    lines.push("DATABASE_URL=");
  }
  return lines.join("\n") + "\n";
}

export function dbGitignoreContent(dialects: string[]): string {
  if (!dialects.includes("sqlite")) return "";
  return [
    "*.sqlite",
    "*.sqlite3",
    "*.db",
    "*.db-journal",
    "*.db-wal",
    "*.db-shm",
    ".test/",
    "",
  ].join("\n");
}

export function apkClientsContent(dialects: string[]): string {
  const seen = new Set<string>();
  const pkgs: string[] = [];
  for (const d of dialects) {
    const p = DIALECT_APK_CLIENTS[d];
    if (!p || seen.has(p)) continue;
    seen.add(p);
    pkgs.push(p);
  }
  const tail = pkgs.length > 0 ? ` ${pkgs.join(" ")}` : "";
  return `RUN apk add --no-cache git${tail}\n`;
}

export function migrateCopyContent(migrateDir: string): string {
  const lines = [
    `COPY sql ${CONTAINER_SQL_ROOT}`,
    `COPY ${migrateDir} ./${migrateDir}`,
  ];
  return lines.join("\n") + "\n";
}


/** The migrate entrypoint hook + DB config files (.env/.env.example/.gitignore). */
const SHARED_MIGRATE_ENTRIES: PatchPlanEntry[] = [
  {
    path: "scripts/entrypoint.sh",
    kind: "marked",
    sections: [{ id: "MIGRATE_HOOK" }],
  },
  { path: ".env", kind: "shared", sections: [{ id: "DB_ENV" }] },
  { path: ".env.example", kind: "shared", sections: [{ id: "DB_ENV" }] },
  { path: ".gitignore", kind: "shared", sections: [{ id: "DB_GITIGNORE" }] },
];

/** TypeScript migrate/backend patch contract. */
export const PATCH_PLAN: PatchPlanEntry[] = [
  {
    path: "app.ts",
    kind: "marked",
    sections: [
      { id: "APP_DB_IMPORTS" },
      { id: "APP_BEFORE_HOOK" },
      { id: "APP_AFTER_HOOK" },
    ],
  },
  {
    path: "Dockerfile",
    kind: "marked",
    sections: [{ id: "APK_CLIENTS" }, { id: "MIGRATE_COPY" }],
  },
  ...SHARED_MIGRATE_ENTRIES,
  {
    path: "package.json",
    kind: "ownedKeys",
    ownedKeys: [
      "scripts.migrate:setup",
      "scripts.migrate",
      "scripts.migrate:down",
      "scripts.pretest",
      "config.test_db",
      "dependencies.<dialect-driver>",
      "allowScripts.<dialect-driver>",
    ],
  },
];

/** @deprecated Prefer PATCH_PLAN. */
export const PATCH_PLAN_TYPESCRIPT = PATCH_PLAN;

export function getPatchPlan(language: string): PatchPlanEntry[] {
  if (language === "typescript") return PATCH_PLAN;
  throw new Error(
    `getPatchPlan: typescript pack has no PATCH_PLAN for language "${language}"`,
  );
}
