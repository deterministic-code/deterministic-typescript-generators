import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { BuiltinMiddleware } from '../middlewareNames';

const PACK_ROOT = dirname(
  createRequire(import.meta.url).resolve('@deterministic-code/rust-generators/package.json'),
);
const RUST_APP_CONFIG = join(PACK_ROOT, 'rust', 'src', 'backend_app_config.rs');
// rustfmt may leave a trailing comma after the last field, so the closing brace match allows it
const RUST_ENTRY_RE =
  /MiddlewareRegistryEntry\s*\{\s*name:\s*"([^"]+)"\s*,\s*r#type:\s*"([^"]+)"\s*,?\s*\}/g;

describe('TS <-> Rust middleware registry parity', () => {
  it('rust/src/backend_app_config.rs mirrors BuiltinMiddleware.all() exactly (name, type, order)', async () => {
    const rustSource = await readFile(RUST_APP_CONFIG, 'utf8');
    const rustList: Array<{ name: string; type: string }> = [];
    for (const match of rustSource.matchAll(RUST_ENTRY_RE)) {
      rustList.push({ name: match[1], type: match[2] });
    }
    expect(rustList.length).toBeGreaterThan(0);
    expect(rustList).toEqual(BuiltinMiddleware.all().map((e) => ({ name: e.name, type: e.type })));
  });
});
