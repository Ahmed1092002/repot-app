import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.CRON_SECRET = 'test-secret';
process.env.SERVICES = JSON.stringify([
  { name: 'example-com', url: 'https://example.com/' },
  { name: 'dead-domain', url: 'https://no-such-host-pulse-test.invalid/' },
]);

const { createApp } = await import('../api/index.js');
const server = createApp().listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
test.after(() => server.close());

test('GET /api/ping without secret returns 401', async () => {
  const res = await fetch(`${base}/api/ping`);
  assert.equal(res.status, 401);
});

test('GET /api/ping with ?key= runs and classifies 200 vs network error', async () => {
  const res = await fetch(`${base}/api/ping?key=test-secret`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.summary.total, 2);
  const byName = new Map(body.results.map((r) => [r.name, r]));
  assert.equal(byName.get('example-com').ok, true);
  assert.equal(byName.get('example-com').status, 200);
  assert.equal(byName.get('dead-domain').ok, false);
  assert.match(byName.get('dead-domain').error, /ENOTFOUND|timeout/);
});

test('POST /check-now from same origin redirects and refreshes results', async () => {
  const res = await fetch(`${base}/check-now`, {
    method: 'POST',
    headers: { origin: base },
    redirect: 'manual',
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/');

  const page = await fetch(base);
  const html = await page.text();
  assert.match(html, /badge (up|down)/);
  assert.match(html, /Check now/);
});

test('POST /check-now without secret or same origin returns 401', async () => {
  const res = await fetch(`${base}/check-now`, {
    method: 'POST',
    headers: { origin: 'https://evil.example' },
    redirect: 'manual',
  });
  assert.equal(res.status, 401);
});

test('GET /api/ping accepts Bearer header too', async () => {
  const res = await fetch(`${base}/api/ping`, {
    headers: { authorization: 'Bearer test-secret' },
  });
  assert.equal(res.status, 200);
});
