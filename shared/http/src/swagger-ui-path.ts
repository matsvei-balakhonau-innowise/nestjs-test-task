import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Resolve swagger-ui-dist on disk. Needed because Nest webpack bundles
 * `swagger-ui-dist/absolute-path.js` and its `__dirname` points at `dist/`,
 * so Swagger UI JS/CSS would 404 without an explicit path.
 */
export function resolveSwaggerUiPath(): string {
  const candidates = [
    join(process.cwd(), 'node_modules', 'swagger-ui-dist'),
    join(process.cwd(), '..', 'node_modules', 'swagger-ui-dist'),
    join(process.cwd(), '..', '..', 'node_modules', 'swagger-ui-dist'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'swagger-ui-bundle.js'))) {
      return dir;
    }
  }

  throw new Error(
    'swagger-ui-dist not found (expected under node_modules from process.cwd())',
  );
}
