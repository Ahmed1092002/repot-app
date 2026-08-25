import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loadServices, ConfigError } from '../lib/config.js';
import { pingService } from '../lib/pinger.js';
import { summarize } from '../lib/classify.js';
import { store } from '../lib/store.js';
import { renderDashboard } from '../lib/dashboard.js';

function safeEqual(a, b) {
  const da = createHash('sha256').update(String(a)).digest();
  const db = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(da, db);
}

let configCache;

function getConfig() {
  if (!configCache) {
    const loaded = loadServices();
    for (const warning of loaded.warnings) console.warn(`[pulse] WARN ${warning}`);
    configCache = loaded.services;
  }
  return configCache;
}

function hasValidSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const key = req.query.key != null ? String(req.query.key) : null;
  return Boolean(
    (bearer !== null && safeEqual(bearer, secret)) || (key !== null && safeEqual(key, secret))
  );
}

function isAuthorized(req) {
  if (!process.env.CRON_SECRET) {
    console.warn('[pulse] WARN CRON_SECRET is not set — /api/ping is UNPROTECTED (development mode only)');
    return true;
  }
  return hasValidSecret(req);
}

function isSameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function canRunCheckNow(req) {
  if (!process.env.CRON_SECRET) return true;
  return hasValidSecret(req) || isSameOrigin(req);
}

async function runPings(services) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const settled = await Promise.allSettled(services.map((s) => pingService(s)));
  const results = settled.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { ok: false, error: String(r.reason), checkedAt: new Date().toISOString() }
  );
  for (const r of results) if (r && r.name) store.set(r);
  return { startedAt, durationMs: Date.now() - t0, results, summary: summarize(results) };
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/ping', async (req, res) => {
    try {
      if (!isAuthorized(req)) {
        return res
          .status(401)
          .json({ error: 'unauthorized: send Authorization: Bearer <CRON_SECRET> or ?key=<CRON_SECRET>' });
      }
      let services;
      try {
        services = getConfig();
      } catch (err) {
        return res.status(500).json({ error: 'configuration error', detail: err.message });
      }
      const startedAt = new Date().toISOString();
      const t0 = Date.now();
      let results = [];
      if (services.length > 0) {
        const settled = await Promise.allSettled(services.map((s) => pingService(s)));
        results = settled.map((r) =>
          r.status === 'fulfilled'
            ? r.value
            : { ok: false, error: String(r.reason), checkedAt: new Date().toISOString() }
        );
        for (const r of results) if (r && r.name) store.set(r);
      }
      res
        .set('cache-control', 'no-store')
        .json({ startedAt, durationMs: Date.now() - t0, results, summary: summarize(results) });
    } catch (err) {
      console.error('[pulse] ERROR /api/ping', err);
      res.status(500).json({ error: 'internal error', detail: err?.message ?? String(err) });
    }
  });

  app.get('/api/status', (req, res) => {
    try {
      let services;
      try {
        services = getConfig();
      } catch (err) {
        return res.status(500).json({ error: 'configuration error', detail: err.message });
      }
      const stored = new Map(store.getAll().map((r) => [r.name, r]));
      const results = services.map(
        (s) =>
          stored.get(s.name) ?? {
            name: s.name,
            url: s.url,
            ok: null,
            status: null,
            latencyMs: null,
            checkedAt: null,
            note: 'not pinged yet on this instance',
          }
      );
      const checked = results.filter((r) => r.ok !== null);
      res.set('cache-control', 'no-store').json({
        generatedAt: new Date().toISOString(),
        results,
        summary: { ...summarize(checked), pending: results.length - checked.length },
      });
    } catch (err) {
      console.error('[pulse] ERROR /api/status', err);
      res.status(500).json({ error: 'internal error', detail: err?.message ?? String(err) });
    }
  });

  app.get('/', (req, res) => {
    let services = [];
    let configError = null;
    try {
      services = getConfig();
    } catch (err) {
      configError = err instanceof ConfigError ? err.message : String(err?.message ?? err);
      res.status(500);
    }
    res.type('html').send(renderDashboard({ services, results: store.getAll(), configError }));
  });

  app.use((req, res) => {
    res.status(404).json({ error: `not found: ${req.method} ${req.path}` });
  });

  app.use((err, req, res, next) => {
    console.error('[pulse] ERROR', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'internal error', detail: err?.message ?? String(err) });
  });

  return app;
}

const app = createApp();
export default app;
