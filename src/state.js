import { query } from "./db.js";
import { CONFIG } from "./config.js";

// Returns { state, context }. Resets to START if older than STALE_MINUTES.
export async function getState(tenantId, phone) {
  const { rows } = await query(
    "select state, context, updated_at from conversations where tenant_id = $1 and phone = $2",
    [tenantId, phone]
  );
  if (!rows.length) return { state: "START", context: {} };
  const row = rows[0];
  const ageMs = Date.now() - new Date(row.updated_at).getTime();
  if (ageMs > CONFIG.STALE_MINUTES * 60 * 1000) return { state: "START", context: {} };
  return { state: row.state, context: row.context || {} };
}

export async function setState(tenantId, phone, state, context = {}) {
  await query(
    `insert into conversations (tenant_id, phone, state, context, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (tenant_id, phone)
     do update set state = excluded.state, context = excluded.context, updated_at = now()`,
    [tenantId, phone, state, context]
  );
}
