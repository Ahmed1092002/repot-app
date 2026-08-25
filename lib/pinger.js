import { isSuccess, describeError } from './classify.js';

export async function pingService(service) {
  const startedAt = Date.now();
  const base = { name: service.name, url: service.url };
  try {
    const res = await fetch(service.url, {
      method: service.method,
      redirect: 'follow',
      headers: { 'user-agent': 'pulse-keepalive/1.0', accept: '*/*' },
      signal: AbortSignal.timeout(service.timeoutMs),
    });
    if (res.body && typeof res.body.cancel === 'function') {
      Promise.resolve(res.body.cancel()).catch(() => {});
    }
    const latencyMs = Date.now() - startedAt;
    const ok = isSuccess(service, { status: res.status });
    const result = { ...base, ok, status: res.status, latencyMs, checkedAt: new Date().toISOString() };
    console.log(`[pulse] ${result.name} ${ok ? 'OK' : 'FAIL'} ${result.status} ${result.latencyMs}ms`);
    return result;
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const result = {
      ...base,
      ok: false,
      error: describeError(err, service.timeoutMs),
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
    console.log(`[pulse] ${result.name} FAIL ${result.error} ${result.latencyMs}ms`);
    return result;
  }
}
