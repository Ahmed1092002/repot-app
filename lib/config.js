import { readFileSync } from 'node:fs';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const DEFAULTS = Object.freeze({
  method: 'GET',
  strict: false,
  expectedStatus: 200,
  timeoutMs: 8000,
});

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : undefined;
}

export function normalizeService(entry, index) {
  const label = `services[${index}]`;
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return { error: `${label}: expected an object` };
  }

  const problems = [];
  const name = asTrimmedString(entry.name);
  const url = asTrimmedString(entry.url);

  if (!name) problems.push(`${label}.name: required non-empty string`);
  if (!url) {
    problems.push(`${label}.url: required non-empty string`);
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      problems.push(`${label}.url: "${url}" is not a valid http(s) URL`);
    }
  }

  const method = asTrimmedString(entry.method)?.toUpperCase() ?? DEFAULTS.method;
  if (!ALLOWED_METHODS.has(method)) {
    problems.push(`${label}.method: "${entry.method}" not allowed (use one of ${[...ALLOWED_METHODS].join(', ')})`);
  }

  const strict = entry.strict ?? DEFAULTS.strict;
  if (typeof strict !== 'boolean') problems.push(`${label}.strict: must be a boolean`);

  const expectedStatus = entry.expectedStatus ?? DEFAULTS.expectedStatus;
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
    problems.push(`${label}.expectedStatus: must be an integer between 100 and 599`);
  }

  const timeoutMs = entry.timeoutMs ?? DEFAULTS.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60000) {
    problems.push(`${label}.timeoutMs: must be an integer between 500 and 60000`);
  }

  if (problems.length) return { error: problems.join('; ') };
  return { value: { name, url, method, strict, expectedStatus, timeoutMs } };
}

export function validateServices(raw) {
  const services = [];
  const errors = [];
  if (!Array.isArray(raw)) {
    return {
      services,
      errors: [
        `configuration must be a JSON array of service objects, e.g. [{"name":"my-api","url":"https://my-api.onrender.com/"}] (got ${raw === null ? 'null' : typeof raw})`,
      ],
    };
  }
  const seen = new Set();
  raw.forEach((entry, i) => {
    const res = normalizeService(entry, i);
    if (res.error) {
      errors.push(res.error);
      return;
    }
    const key = res.value.name.toLowerCase();
    if (seen.has(key)) {
      errors.push(`services[${i}]: duplicate name "${res.value.name}"`);
      return;
    }
    seen.add(key);
    services.push(res.value);
  });
  return { services, errors };
}

function readConfigFile(fileUrl) {
  try {
    return { ok: true, data: JSON.parse(readFileSync(fileUrl, 'utf8')) };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: false, reason: 'missing' };
    if (err instanceof SyntaxError) return { ok: false, reason: `services.json contains invalid JSON: ${err.message}` };
    return { ok: false, reason: `cannot read services.json: ${err?.message ?? err}` };
  }
}

export function loadServices(env = process.env) {
  const warnings = [];
  let raw;
  let source = 'services.json';

  const envJson = asTrimmedString(env.SERVICES);
  if (envJson) {
    source = 'SERVICES env var';
    try {
      raw = JSON.parse(envJson);
    } catch (err) {
      throw new ConfigError(`SERVICES env var is not valid JSON: ${err?.message ?? err}`);
    }
  } else {
    const file = readConfigFile(new URL('../services.json', import.meta.url));
    if (!file.ok) {
      if (file.reason === 'missing') {
        warnings.push('no services.json found and no SERVICES env var set — nothing to ping');
        return { services: [], warnings };
      }
      throw new ConfigError(file.reason);
    }
    raw = file.data;
  }

  const { services, errors } = validateServices(raw);
  if (errors.length) {
    throw new ConfigError(`invalid service configuration (${source}): ${errors.join(' | ')}`);
  }
  if (services.length === 0) {
    warnings.push(`service configuration (${source}) is empty — nothing to ping`);
  }
  return { services, warnings };
}
