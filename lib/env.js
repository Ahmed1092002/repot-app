import { existsSync, readFileSync } from 'node:fs';

export function loadDotEnv(path = '.env') {
  const fileUrl = new URL(`../${path}`, import.meta.url);
  if (!existsSync(fileUrl)) return;
  for (const line of readFileSync(fileUrl, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    let value = raw;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
