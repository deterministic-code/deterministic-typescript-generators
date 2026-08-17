/** The `view_type_routes` directive (filter + eager paths) from a routes doc's `includes:` list, or null. */
export function routeViewTypeDirective(routesDoc: unknown): {
  filter?: unknown;
  eager_path?: unknown;
  eager_read_member_only?: unknown;
  eager_write_path?: unknown;
} | null {
  const includes =
    routesDoc &&
    typeof routesDoc === 'object' &&
    Array.isArray((routesDoc as { includes?: unknown }).includes)
      ? (routesDoc as { includes: unknown[] }).includes
      : [];
  for (const entry of includes) {
    if (entry && typeof entry === 'object' && 'view_type_routes' in entry) {
      return (entry as { view_type_routes: NonNullable<ReturnType<typeof routeViewTypeDirective>> })
        .view_type_routes;
    }
  }
  return null;
}
