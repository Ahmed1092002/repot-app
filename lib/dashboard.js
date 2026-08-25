const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

function fmtTime(iso) {
  if (!iso) return '—';
  return `${new Date(iso).toUTCString().slice(17, 25)} UTC`;
}

function chip(label, value, tone = '') {
  return `<div class="chip"><span class="num ${tone}">${esc(value)}</span><span class="lbl">${esc(label)}</span></div>`;
}

function badge(result) {
  if (!result) return '<span class="badge pending">PENDING</span>';
  if (result.ok === true) return '<span class="badge up">UP</span>';
  return '<span class="badge down">DOWN</span>';
}

function rowHtml({ service, result: r }) {
  const errHtml = r && r.ok === false && r.error ? `<div class="err">${esc(r.error)}</div>` : '';
  const strictTag = service.strict ? '<span class="tag">strict</span>' : '';
  return `<tr>
    <td><div class="svc">${esc(service.name)}${strictTag}</div><div class="url">${esc(service.url)}</div></td>
    <td>${badge(r)}${errHtml}</td>
    <td class="mono">${r && r.latencyMs != null ? `${r.latencyMs} ms` : '—'}</td>
    <td class="mono">${fmtTime(r && r.checkedAt)}</td>
  </tr>`;
}

export function renderDashboard({ services, results = [], configError = null }) {
  const byName = new Map((results || []).map((r) => [r.name, r]));
  const rows = (services || []).map((s) => ({ service: s, result: byName.get(s.name) || null }));
  const checkedRows = rows.filter((r) => r.result);
  const up = checkedRows.filter((r) => r.result.ok === true).length;
  const down = checkedRows.length - up;
  const pending = rows.length - checkedRows.length;
  const lastCheckedAt = checkedRows.reduce(
    (acc, r) => (r.result.checkedAt > acc ? r.result.checkedAt : acc),
    ''
  );

  let body;
  if (configError) {
    body = `<div class="banner bad"><strong>Configuration error:</strong> ${esc(configError)}</div>`;
  } else if (rows.length === 0) {
    body =
      '<div class="banner info">No services configured yet. Add entries to <code>services.json</code> or set the <code>SERVICES</code> environment variable.</div>';
  } else {
    body = `
      <div class="chips">
        ${chip('Services', rows.length)}
        ${chip('Up', up, 'up')}
        ${chip('Down', down, 'down')}
        ${pending > 0 ? chip('Pending', pending) : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Service</th><th>Status</th><th>Latency</th><th>Last check</th></tr></thead>
          <tbody>${rows.map(rowHtml).join('')}</tbody>
        </table>
      </div>`;
  }

  const checkNowBtn =
    !configError && rows.length > 0
      ? `<form method="post" action="/check-now" class="now"><button type="submit" onclick="this.disabled=true;this.textContent='Checking…'">Check now</button></form>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="30">
<title>Pulse · keep-alive dashboard</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:24px 16px;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0b1220;color:#dbe4f0;line-height:1.45}
.wrap{max-width:900px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:14px}
h1{font-size:1.35rem;margin:0;letter-spacing:.04em}
h1 .dot{color:#4ade80}
.sub{font-size:.78rem;color:#7f93b5}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.chip{background:#141d33;border:1px solid #223052;border-radius:10px;padding:8px 14px;min-width:86px}
.num{display:block;font-size:1.3rem;font-weight:700;font-variant-numeric:tabular-nums}
.num.up{color:#4ade80}.num.down{color:#f87171}
.lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:.09em;color:#8fa3c4}
.table-wrap{overflow-x:auto;border:1px solid #223052;border-radius:12px;background:#101a2e}
table{width:100%;border-collapse:collapse;font-size:.9rem;min-width:560px}
th{font-size:.68rem;text-transform:uppercase;letter-spacing:.09em;color:#8fa3c4;text-align:left;padding:10px 14px;border-bottom:1px solid #223052}
td{padding:12px 14px;border-top:1px solid #1a2745;vertical-align:top}
tbody tr:first-child td{border-top:0}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.7rem;font-weight:700;letter-spacing:.07em}
.badge.up{color:#0b1220;background:#4ade80}
.badge.down{color:#fff;background:#ef4444}
.badge.pending{color:#cbd5e1;background:#334155}
.svc{font-weight:600}
.tag{margin-left:6px;padding:1px 6px;border:1px solid #3b82f6;color:#93c5fd;border-radius:6px;font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;vertical-align:middle}
.url{color:#7f93b5;font-size:.76rem;word-break:break-all;margin-top:2px}
.err{color:#fca5a5;font-size:.75rem;margin-top:4px;word-break:break-word}
.mono{font-variant-numeric:tabular-nums;white-space:nowrap;color:#b7c5dd}
.banner{border-radius:10px;padding:11px 14px;margin-bottom:16px;font-size:.85rem;word-break:break-word}
.banner.bad{background:#3f1d24;border:1px solid #7f1d1d;color:#fecaca}
.banner.info{background:#14243a;border:1px solid #27446b;color:#bfdbfe}
code{background:#1a2745;border-radius:5px;padding:1px 5px;font-size:.85em}
footer{margin-top:14px;font-size:.76rem;color:#7f93b5}
.head-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.now button{background:#1f6feb;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:.8rem;font-weight:600;cursor:pointer}
.now button:hover{background:#388bfd}
.now button:disabled{opacity:.6;cursor:default}
@media (max-width:520px){body{padding:16px 10px}.chip{flex:1;min-width:70px}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Pulse<span class="dot">.</span> <span class="sub">keep-alive dashboard</span></h1>
    <div class="head-right">
      <span class="sub">last check ${esc(fmtTime(lastCheckedAt))}</span>
      ${checkNowBtn}
    </div>
  </header>
  ${body}
  <footer>auto-refreshes every 30s · trigger a ping via <code>GET /api/ping</code> (requires the cron secret)</footer>
</div>
</body>
</html>`;
}
