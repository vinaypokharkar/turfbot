import { query, withDirectTxn } from "./db.js";
import { CONFIG } from "./config.js";
import { countTodayAttempts } from "./bookings.js";

export async function listFree(tenantId, dateIso) {
  const { rows } = await query(
    `select * from slots
      where tenant_id = $1 and slot_date = $2 and status = 'free'
      order by start_time`,
    [tenantId, dateIso]
  );
  return rows;
}

export async function getSlot(slotId) {
  const { rows } = await query("select * from slots where id = $1", [slotId]);
  return rows[0] || null;
}

// Atomically hold a free slot. Enforces anti-abuse caps. Uses the DIRECT pool
// so SELECT ... FOR UPDATE actually locks the row (pooler would void it).
// Returns { ok, slot } or { ok:false, reason }.
export async function holdSlot(tenant, slotId, phone) {
  return withDirectTxn(async (c) => {
    // one active hold per phone
    const active = await c.query(
      `select count(*)::int n from slots
        where tenant_id = $1 and held_by = $2 and status = 'held' and hold_expires > now()`,
      [tenant.id, phone]
    );
    if (active.rows[0].n >= 1) return { ok: false, reason: "active_hold" };

    // daily attempt cap (proxy: bookings created today)
    const attempts = await countTodayAttempts(tenant.id, phone);
    if (attempts >= CONFIG.MAX_DAILY_HOLDS) return { ok: false, reason: "daily_limit" };

    const sel = await c.query("select * from slots where id = $1 and tenant_id = $2 for update", [
      slotId,
      tenant.id,
    ]);
    if (!sel.rows.length) return { ok: false, reason: "not_found" };
    const slot = sel.rows[0];
    if (slot.status !== "free") return { ok: false, reason: "taken" };

    await c.query(
      `update slots set status = 'held', held_by = $1,
              hold_expires = now() + ($2 || ' minutes')::interval
        where id = $3`,
      [phone, CONFIG.HOLD_MINUTES, slotId]
    );
    slot.status = "held";
    slot.held_by = phone;
    return { ok: true, slot };
  });
}

export async function freeSlot(slotId) {
  await query(
    "update slots set status = 'free', held_by = null, hold_expires = null, booking_id = null where id = $1 and status != 'booked'",
    [slotId]
  );
}
