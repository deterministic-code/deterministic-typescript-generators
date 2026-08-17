import { Request, Response, NextFunction } from 'express';
import { IAuthorizationService } from '../services/IAuthorizationService';
import { BusinessError } from '../errors/BusinessError';

const HTTP_METHOD_TO_VERB: Record<string, string> = {
  POST: 'create',
  GET: 'read',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * Derives a permission string of the form `"<verb>:<resource>"` from an
 * HTTP method and request path. The path's first segment after `"/api/"`
 * becomes the resource, kebab-case converts to snake_case, and common
 * English plurals are singularised:
 *
 * - `entries` → `entry`   (`-ies` rule)
 * - `classes` → `class`   (`-sses` / `-shes` / `-xes` rule: drops two chars)
 * - `projects` → `project` (plain trailing `s`)
 *
 * Verb mapping: `GET→read`, `POST→create`, `PUT/PATCH→update`, `DELETE→delete`.
 * Any other method lowercases to its own verb (e.g. `OPTIONS→options`).
 *
 * @example
 * derivePermission("GET",    "/api/projects");    // "read:project"
 * derivePermission("DELETE", "/api/token-hits/42"); // "delete:token_hit"
 */
export function derivePermission(method: string, path: string): string {
  const verb = HTTP_METHOD_TO_VERB[method.toUpperCase()] ?? method.toLowerCase();

  const withoutPrefix = path.replace(/^\/api\//, '');
  const firstSegment = withoutPrefix.split('/')[0];
  const snakeCase = firstSegment.replace(/-/g, '_');
  const singular = singularize(snakeCase);

  return `${verb}:${singular}`;
}

function singularize(word: string): string {
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  }
  if (word.endsWith('sses') || word.endsWith('shes') || word.endsWith('xes')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Factory that returns Express middleware for **authorization** (the "can you
 * do X?" check). Extracts the Bearer token, derives a permission string via
 * {@link derivePermission}, and asks `authorizationService.canAccessPermission`.
 *
 * Failures throw a {@link BusinessError} through `next(err)`; the error
 * handler maps that to a 401/403/… response:
 *
 * - missing header     → 401 `"Authorization header is required"`
 * - non-Bearer         → 401 `"Authorization header must use Bearer scheme"`
 * - empty token        → 401 `"Token is required"`
 * - `granted === false`→ `result.statusCode ?? 403` with `result.reason ?? "Forbidden"`
 *
 * @param authorizationService Implementation of {@link IAuthorizationService}.
 */
export function authorize(authorizationService: IAuthorizationService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        next(new BusinessError(401, 'Authorization header is required'));
        return;
      }

      const parts = authHeader.split(' ');

      if (parts[0] !== 'Bearer') {
        next(new BusinessError(401, 'Authorization header must use Bearer scheme'));
        return;
      }

      const token = parts.slice(1).join(' ').trim();

      if (!token) {
        next(new BusinessError(401, 'Token is required'));
        return;
      }

      const permission = derivePermission(req.method, req.path);

      const result = await authorizationService.canAccessPermission(token, permission);

      if (result.granted) {
        next();
      } else {
        next(new BusinessError(result.statusCode ?? 403, result.reason || 'Forbidden'));
      }
    } catch (err) {
      next(err);
    }
  };
}
