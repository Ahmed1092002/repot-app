import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateServices, normalizeService, loadServices, ConfigError, DEFAULTS } from '../lib/config.js';

test('validateServices applies defaults', () => {
  const { services, errors } = validateServices([
    { name: 'a', url: 'https://a.example/' },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(services[0], {
    name: 'a',
    url: 'https://a.example/',
    method: DEFAULTS.method,
    strict: DEFAULTS.strict,
    expectedStatus: DEFAULTS.expectedStatus,
    timeoutMs: DEFAULTS.timeoutMs,
  });
});

test('validateServices rejects missing name/url with a clear message', () => {
  const { errors } = validateServices([{ url: 'https://a.example/' }, { name: 'b' }]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /services\[0\]\.name: required/);
  assert.match(errors[1], /services\[1\]\.url: required/);
});

test('validateServices rejects bad URLs', () => {
  for (const bad of ['not-a-url', 'ftp://x.example/', 'javascript:alert(1)']) {
    const { errors } = validateServices([{ name: 'x', url: bad }]);
    assert.equal(errors.length, 1, `url "${bad}" should be rejected`);
    assert.match(errors[0], /not a valid http\(s\) URL/);
  }
  for (const empty of ['', '   ']) {
    const { errors } = validateServices([{ name: 'x', url: empty }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /required non-empty string/);
  }
});

test('validateServices rejects duplicate names (case-insensitive)', () => {
  const { errors } = validateServices([
    { name: 'api', url: 'https://a.example/' },
    { name: 'API', url: 'https://b.example/' },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplicate name "API"/);
});

test('validateServices rejects non-array config', () => {
  assert.equal(validateServices({}).errors.length, 1);
  assert.equal(validateServices(null).errors.length, 1);
  assert.equal(validateServices('[]').errors.length, 1);
});

test('validateServices accepts empty array without errors', () => {
  const { services, errors } = validateServices([]);
  assert.deepEqual(errors, []);
  assert.deepEqual(services, []);
});

test('validateServices rejects invalid method/expectedStatus/timeoutMs/strict', () => {
  const cases = [
    [{ name: 'x', url: 'https://x.example/', method: 'BREW' }, /method/],
    [{ name: 'x', url: 'https://x.example/', expectedStatus: 99 }, /expectedStatus/],
    [{ name: 'x', url: 'https://x.example/', expectedStatus: 200.5 }, /expectedStatus/],
    [{ name: 'x', url: 'https://x.example/', timeoutMs: 100 }, /timeoutMs/],
    [{ name: 'x', url: 'https://x.example/', strict: 'yes' }, /strict/],
    ['nope', /expected an object/],
  ];
  for (const [entry, pattern] of cases) {
    const [, errors] = Object.values(validateServices([entry]));
    assert.equal(errors.length, 1);
    assert.match(errors[0], pattern);
  }
});

test('normalizeService trims whitespace around name/url/method', () => {
  const { value } = normalizeService(
    { name: '  api  ', url: ' https://api.example/health ', method: ' get ' },
    0
  );
  assert.deepEqual(
    { name: value.name, url: value.url, method: value.method },
    { name: 'api', url: 'https://api.example/health', method: 'GET' }
  );
});

test('loadServices prefers SERVICES env var over services.json', () => {
  const env = { SERVICES: '[{"name":"env-svc","url":"https://env.example/","strict":true}]' };
  const { services, warnings } = loadServices(env);
  assert.deepEqual(warnings, []);
  assert.equal(services.length, 1);
  assert.equal(services[0].name, 'env-svc');
  assert.equal(services[0].strict, true);
});

test('loadServices throws on invalid SERVICES JSON', () => {
  assert.throws(() => loadServices({ SERVICES: '{oops' }), ConfigError);
});

test('loadServices throws ConfigError listing every invalid entry', () => {
  const env = {
    SERVICES: '[{"name":"","url":"https://a/"},{"name":"b","url":"nope"},{"name":"c","url":"https://c/"},{"name":"C","url":"https://d/"}]',
  };
  try {
    loadServices(env);
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.match(err.message, /services\[0\]\.name/);
    assert.match(err.message, /services\[1\]\.url/);
    assert.match(err.message, /duplicate name "C"/);
  }
});

test('loadServices warns (but does not throw) on an explicitly empty array', () => {
  const { services, warnings } = loadServices({ SERVICES: '[]' });
  assert.deepEqual(services, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /nothing to ping/);
});
