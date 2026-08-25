import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSuccess, describeError, summarize } from '../lib/classify.js';

const svc = (over = {}) => ({
  name: 't',
  url: 'https://t.example/',
  method: 'GET',
  strict: false,
  expectedStatus: 200,
  timeoutMs: 8000,
  ...over,
});

test('non-strict: ANY HTTP status counts as success', () => {
  for (const status of [200, 201, 204, 301, 302, 400, 401, 403, 404, 429, 500, 502, 503]) {
    assert.equal(isSuccess(svc(), { status }), true, `status ${status} should be ok`);
  }
});

test('non-strict: network error counts as failure', () => {
  assert.equal(isSuccess(svc(), { error: 'getaddrinfo ENOTFOUND x.invalid' }), false);
});

test('strict: mismatched status fails, matching passes', () => {
  assert.equal(isSuccess(svc({ strict: true }), { status: 404 }), false);
  assert.equal(isSuccess(svc({ strict: true }), { status: 200 }), true);
});

test('strict: honors custom expectedStatus', () => {
  const s = svc({ strict: true, expectedStatus: 204 });
  assert.equal(isSuccess(s, { status: 204 }), true);
  assert.equal(isSuccess(s, { status: 200 }), false);
});

test('strict: network error still fails', () => {
  assert.equal(isSuccess(svc({ strict: true }), { error: 'timeout after 8000ms' }), false);
});

test('describeError maps abort/timeout errors', () => {
  const err = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  assert.match(describeError(err, 8000), /^timeout after 8000ms$/);
});

test('describeError surfaces undici cause codes (DNS etc.)', () => {
  const inner = Object.assign(new Error('getaddrinfo ENOTFOUND nope.invalid'), { code: 'ENOTFOUND' });
  const err = Object.assign(new Error('fetch failed'), { cause: inner });
  assert.match(describeError(err, 8000), /ENOTFOUND/);
});

test('summarize counts up/failed', () => {
  assert.deepEqual(summarize([{ ok: true }, { ok: false }, { ok: true }]), { total: 3, up: 2, failed: 1 });
  assert.deepEqual(summarize([]), { total: 0, up: 0, failed: 0 });
});
