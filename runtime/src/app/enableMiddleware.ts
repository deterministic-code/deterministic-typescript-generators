import { MIDDLEWARE_REGISTRY } from '../middleware/middlewareNames';
import type { MiddlewareEntry } from './loaders/parseBackendAppConfig';

const TIER_TO_NAME: Record<string, string> = {
  route: 'traceRoute',
  service: 'traceService',
  datasource: 'traceDatasource',
};

const REGISTRY_BY_NAME = new Map(MIDDLEWARE_REGISTRY.map((e) => [e.name, e]));

/**
 * Translate a comma-separated env value (e.g. `DETERMINISTIC_TRACE`) into the
 * list of middleware names that should be flipped to `enabled: true` by
 * `applyEnableMiddleware`.
 *
 * Tier shortcuts `route|service|datasource` (case-insensitive) translate to
 * the seeded `traceRoute|traceService|traceDatasource` middleware names.
 * Anything else is passed through unchanged, so a project that registers a
 * custom middleware named `myCustom` can enable it via the same channel.
 */
export function parseEnableMiddlewareEnv(value: string | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const lower = token.toLowerCase();
    out.push(TIER_TO_NAME[lower] ?? token);
  }
  return out;
}

/**
 * Mutate `entries` so any entry whose `name` appears in `enable` is flipped
 * to `enabled: true`. Entries not named in `enable` are left untouched, so
 * already-enabled middleware stays enabled and disabled ones stay disabled.
 *
 * When `enable` references a known registry entry (e.g. `traceRoute`) that
 * is NOT present in `entries`, the missing entry is appended with
 * `enabled: true` and the registry-derived `type`. This is what lets a
 * project enable the three trace tiers via `DETERMINISTIC_TRACE=route,...`
 * without having to also declare `traceRoute`/`traceService`/
 * `traceDatasource` in backend-app.yaml.
 */
export function applyEnableMiddleware(
  entries: MiddlewareEntry[],
  enable: ReadonlyArray<string>,
): void {
  if (enable.length === 0) return;
  const present = new Set(entries.map((e) => e.name));
  const set = new Set(enable);
  for (const entry of entries) {
    if (set.has(entry.name)) entry.enabled = true;
  }
  for (const name of enable) {
    if (present.has(name)) continue;
    const registryEntry = REGISTRY_BY_NAME.get(name);
    if (!registryEntry) continue;
    entries.push({ name, type: registryEntry.type, enabled: true });
  }
}
