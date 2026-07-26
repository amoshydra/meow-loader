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
