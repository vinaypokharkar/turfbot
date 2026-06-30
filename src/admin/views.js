import { CONFIG } from "../config.js";
import { fmtDate, fmtTime, fmtMoney } from "../util.js";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function layout(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Turf Admin</title>
<style>
:root{--bg:#0f1115;--card:#181b22;--line:#262b34;--txt:#e6e9ef;--mut:#8b93a3;--acc:#4f8cff;--ok:#2ecc71;--warn:#f0a020;--bad:#e74c3c}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--txt)}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
header{background:var(--card);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;gap:16px;align-items:center}
header b{font-size:16px}header .sp{flex:1}
.wrap{max-width:1000px;margin:24px auto;padding:0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:18px}
h1{font-size:20px;margin:0 0 14px}h2{font-size:15px;margin:0 0 12px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px}
th{color:var(--mut);font-weight:600}
label{display:block;margin:10px 0 4px;color:var(--mut);font-size:12px}
input,select{width:100%;background:#0d0f14;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:9px 10px;font-size:14px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
button,.btn{background:var(--acc);color:#fff;border:0;border-radius:7px;padding:9px 14px;font-size:14px;cursor:pointer;display:inline-block}
.btn.sec{background:#2a3140}.btn.warn{background:var(--warn)}.btn.bad{background:var(--bad)}
.pill{padding:2px 8px;border-radius:99px;font-size:12px}
.free{background:#10331f;color:var(--ok)}.held{background:#3a2e0e;color:var(--warn)}.booked{background:#0e2740;color:var(--acc)}
.pending{color:var(--warn)}.confirmed{color:var(--ok)}.cancelled,.refunded{color:var(--bad)}
.mut{color:var(--mut)}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
form.inline{display:inline}
</style></head><body>
<header><b>🏟️ Turf Admin</b><a href="/admin">Dashboard</a><a href="/admin/tenants/new">+ Add turf</a><span class="sp"></span>
<form class="inline" method="post" action="/admin/logout"><button class="btn sec">Logout</button></form></header>
<div class="wrap">${body}</div></body></html>`;
}

export function loginPage(error) {
  return layout(
    "Login",
    `<div class="card" style="max-width:360px;margin:60px auto">
<h1>Admin login</h1>
${error ? `<p style="color:var(--bad)">${esc(error)}</p>` : ""}
<form method="post" action="/admin/login">
<label>Password</label><input type="password" name="password" autofocus>
<div style="margin-top:14px"><button>Sign in</button></div>
</form></div>`
  );
}

export function dashboardPage(tenants) {
  const rows = tenants
    .map(
      (t) => `<tr>
<td><a href="/admin/tenants/${t.id}">${esc(t.turf_name)}</a></td>
<td class="mono">${esc(t.phone_number_id)}</td>
<td>${esc(t.owner_wa || "-")}</td>
<td>${t.razorpay_test ? '<span class="pill held">test</span>' : '<span class="pill booked">live</span>'}</td>
<td class="mut">${fmtMoney(t.price_paise)}</td>
</tr>`
    )
    .join("");
  return layout(
    "Dashboard",
    `<h1>Turfs (${tenants.length})</h1>
<div class="card"><table>
<tr><th>Name</th><th>Phone number ID</th><th>Owner</th><th>Mode</th><th>Price</th></tr>
${rows || '<tr><td colspan="5" class="mut">No turfs yet. Add one.</td></tr>'}
</table></div>`
  );
}

const F = (label, name, val, type = "text") =>
  `<div><label>${label}</label><input name="${name}" type="${type}" value="${esc(val)}"></div>`;

export function tenantFormPage(t) {
  const editing = !!t;
  t = t || {};
  const action = editing ? `/admin/tenants/${t.id}` : "/admin/tenants";
  return layout(
    editing ? "Edit turf" : "Add turf",
    `<h1>${editing ? "Edit" : "Add"} turf</h1>
<form method="post" action="${action}">
<div class="card"><h2>Turf</h2>
${F("Turf name", "turf_name", t.turf_name)}
<div class="row">${F("Open time", "open_time", t.open_time || "06:00", "time")}${F("Close time", "close_time", t.close_time || "23:00", "time")}</div>
<div class="row">${F("Slot minutes", "slot_minutes", t.slot_minutes || 60, "number")}${F("Price (paise)", "price_paise", t.price_paise || 90000, "number")}</div>
${F("Address", "address", t.address)}
${F("Maps URL", "maps_url", t.maps_url)}
</div>
<div class="card"><h2>WhatsApp (Meta)</h2>
${F("Phone number ID", "phone_number_id", t.phone_number_id)}
${F("WA token", "wa_token", t.wa_token)}
<div class="row">${F("Business phone", "wa_business_phone", t.wa_business_phone)}${F("Owner WhatsApp", "owner_wa", t.owner_wa)}</div>
</div>
<div class="card"><h2>Razorpay</h2>
<div class="row">${F("Key ID", "razorpay_key_id", t.razorpay_key_id)}${F("Key secret", "razorpay_key_secret", t.razorpay_key_secret)}</div>
${F("Webhook secret", "razorpay_webhook_secret", t.razorpay_webhook_secret)}
<label>Mode</label><select name="razorpay_test"><option value="true"${t.razorpay_test !== false ? " selected" : ""}>Test</option><option value="false"${t.razorpay_test === false ? " selected" : ""}>Live</option></select>
</div>
<button>${editing ? "Save changes" : "Create turf"}</button>
${editing ? '<a class="btn sec" href="/admin/tenants/' + t.id + '" style="margin-left:8px">Cancel</a>' : ""}
</form>`
  );
}

export function tenantDetailPage(t, bookings, summary) {
  const hookUrl = `${CONFIG.PUBLIC_BASE_URL || ""}/razorpay/webhook/${t.id}`;
  const brows = bookings
    .map(
      (b) => `<tr>
<td>#${b.id}</td><td>${esc(b.player_name || "-")}</td><td class="mono">${esc(b.player_phone)}</td>
<td>${fmtDate(b.slot_date)} ${fmtTime(b.start_time)}</td>
<td class="${b.status}">${b.status}</td><td>${fmtMoney(b.amount_paise)}</td>
<td>${b.status === "confirmed" ? `<form class="inline" method="post" action="/admin/bookings/${b.id}/cancel" onsubmit="return confirm('Cancel & refund #${b.id}?')"><button class="btn bad">Cancel</button></form>` : ""}</td>
</tr>`
    )
    .join("");
  return layout(
    t.turf_name,
    `<h1>${esc(t.turf_name)} <a class="btn sec" href="/admin/tenants/${t.id}/edit" style="font-size:13px;vertical-align:middle">Edit</a></h1>
<div class="card"><h2>Slots (upcoming)</h2>
<span class="pill free">free ${summary.free}</span>
<span class="pill held">held ${summary.held}</span>
<span class="pill booked">booked ${summary.booked}</span>
<div style="margin-top:14px">
<form class="inline" method="post" action="/admin/tenants/${t.id}/generate-slots">
<input type="number" name="days" value="7" style="width:70px;display:inline-block">
<button>Generate slots</button></form>
<form class="inline" method="post" action="/admin/tenants/${t.id}/free-held" style="margin-left:8px"
 onsubmit="return confirm('Free all held slots?')"><button class="btn warn">Free stuck holds</button></form>
</div></div>
<div class="card"><h2>Razorpay webhook URL</h2>
<div class="mono">${esc(hookUrl)}</div>
<p class="mut">Paste in Razorpay → Webhooks, event <b>payment_link.paid</b>, secret = this turf's webhook secret.</p></div>
<div class="card"><h2>Recent bookings</h2><table>
<tr><th>ID</th><th>Name</th><th>Phone</th><th>Slot</th><th>Status</th><th>Amount</th><th></th></tr>
${brows || '<tr><td colspan="7" class="mut">No bookings yet.</td></tr>'}
</table></div>`
  );
}
