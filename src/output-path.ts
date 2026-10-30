import { existsSync } from 'node:fs';
import { resolve, join, parse } from 'node:path';

export function getUniqueFilePath(filePath: string): string {
  const parsed = parse(resolve(filePath));
  let counter = 0;
  let candidate = resolve(filePath);
  while (existsSync(candidate)) {
    counter++;
    candidate = join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
  }
  return candidate;
}

/**
 * Pick a path for the merged output. When the requested file no longer exists
 * at merge time it is used as-is; when it appeared while downloading (and
 * --force was not given), the next free "-1", "-2", ... name is used instead.
 */
export function pickAvailableOutputPath(
  requested: string,
  force: boolean,
): { path: string; renamed: boolean } {
  if (force || !existsSync(requested)) {
    return { path: requested, renamed: false };
  }

  return { path: getUniqueFilePath(requested), renamed: true };
}
