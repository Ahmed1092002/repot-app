import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard } from '../lib/dashboard.js';

test('dashboard escapes HTML in service names and error messages', () => {
  const html = renderDashboard({
    services: [
      {
        name: '<script>alert(1)</script>',
        url: 'https://evil.example/"onmouseover="alert(1)',
        method: 'GET',
        strict: false,
        expectedStatus: 200,
        timeoutMs: 8000,
      },
    ],
    results: [
      {
        name: '<script>alert(1)</script>',
        url: 'https://evil.example/',
        ok: false,
        error: 'getaddrinfo ENOTFOUND <img src=x onerror=alert(1)>',
        latencyMs: 5,
        checkedAt: new Date().toISOString(),
      },
    ],
  });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag must not appear');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<img src=x onerror'), 'raw img tag must not appear');
  assert.ok(html.includes('ENOTFOUND'));
});

test('dashboard shows pending badge before first ping and empty state without services', () => {
  const html = renderDashboard({
    services: [
      { name: 'a', url: 'https://a.example/', method: 'GET', strict: false, expectedStatus: 200, timeoutMs: 8000 },
    ],
    results: [],
  });
  assert.match(html, /PENDING/);
  assert.match(html, /http-equiv="refresh" content="30"/);

  const empty = renderDashboard({ services: [], results: [] });
  assert.match(empty, /No services configured/);
});

test('dashboard renders UP/DOWN badges and summary chips', () => {
  const now = new Date().toISOString();
  const html = renderDashboard({
    services: [
      { name: 'ok-svc', url: 'https://a.example/', method: 'GET', strict: false, expectedStatus: 200, timeoutMs: 8000 },
      { name: 'dead-svc', url: 'https://dead.invalid/', method: 'GET', strict: false, expectedStatus: 200, timeoutMs: 8000 },
    ],
    results: [
      { name: 'ok-svc', url: 'https://a.example/', ok: true, status: 200, latencyMs: 42, checkedAt: now },
      { name: 'dead-svc', url: 'https://dead.invalid/', ok: false, error: 'timeout after 8000ms', latencyMs: 8004, checkedAt: now },
    ],
  });
  assert.match(html, /class="badge up">UP</);
  assert.match(html, /class="badge down">DOWN</);
  assert.match(html, /timeout after 8000ms/);
  assert.match(html, /42 ms/);
});
