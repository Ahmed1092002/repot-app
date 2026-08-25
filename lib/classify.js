export function isSuccess(service, outcome) {
  if (!outcome || outcome.error != null) return false;
  if (typeof outcome.status !== 'number') return false;
  if (!service.strict) return true;
  return outcome.status === service.expectedStatus;
}

export function describeError(err, timeoutMs) {
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
    return `timeout after ${timeoutMs}ms`;
  }
  const cause = err?.cause;
  if (cause && (cause.code || cause.message)) {
    const text = [cause.code, cause.message].filter(Boolean).join(' ').trim();
    if (text) return text;
  }
  return err?.message ?? String(err) ?? 'unknown error';
}

export function summarize(results) {
  const total = results.length;
  const up = results.filter((r) => r && r.ok === true).length;
  return { total, up, failed: total - up };
}
