import { query, withDirectTxn } from "./db.js";
import { CONFIG } from "./config.js";
import { send } from "./wa/send.js";
import { buildText } from "./wa/messages.js";
import { getBookingById } from "./bookings.js";
import { refund } from "./payments.js";
import { fmtDate, fmtTime } from "./util.js";
import { log } from "./logger.js";

// "CANCEL 123" → cancel booking 123 if it belongs to this phone and is >= CANCEL_HOURS away.
export async function handleCancel(tenant, from, text) {
  const m = text.match(/cancel\s+#?(\d+)/i);
  if (!m) return send(tenant, buildText(from, "To cancel, send: *CANCEL <booking id>* (e.g. CANCEL 123)."));
  const id = Number(m[1]);

  const booking = await getBookingById(tenant.id, id);
  if (!booking || booking.player_phone !== from) {
    return send(tenant, buildText(from, "No booking found with that id under your number."));
  }
  if (booking.status === "cancelled" || booking.status === "refunded") {
    return send(tenant, buildText(from, "That booking is already cancelled."));
  }
  if (booking.status !== "confirmed") {
    return send(tenant, buildText(from, "That booking isn't confirmed, so there's nothing to cancel."));
  }

  const { rows } = await query("select * from slots where id = $1", [booking.slot_id]);
  const slot = rows[0];
  const startMs = new Date(`${toISO(slot.slot_date)}T${slot.start_time}+05:30`).getTime();
  if (startMs - Date.now() < CONFIG.CANCEL_HOURS * 3600 * 1000) {
    return send(
      tenant,
      buildText(from, `Cancellations must be at least ${CONFIG.CANCEL_HOURS}h before the slot.`)
    );
  }

  // Free slot + mark booking, in one txn.
  await withDirectTxn(async (c) => {
    await c.query(
      "update slots set status='free', held_by=null, hold_expires=null, booking_id=null where id=$1",
      [slot.id]
    );
    await c.query("update bookings set status='cancelled', updated_at=now() where id=$1", [id]);
  });

  // Auto-refund (best-effort; refund failure shouldn't block cancellation).
  if (booking.razorpay_payment_id) {
    try {
      await refund(tenant, booking.razorpay_payment_id, booking.amount_paise);
      await query("update bookings set status='refunded', updated_at=now() where id=$1", [id]);
    } catch (e) {
      log.error("refund_failed", { tenant_id: tenant.id, booking_id: id, err: String(e) });
    }
  }

  await send(
    tenant,
    buildText(from, `✅ Booking #${id} cancelled. Refund (if paid) is being processed.`)
  );
  // Owner notify (free-form; outside the 24h window use the approved
  // `owner_cancellation` template instead).
  if (tenant.owner_wa) {
    await send(
      tenant,
      buildText(
        tenant.owner_wa,
        `⚠️ Cancellation — ${fmtDate(slot.slot_date)}, ${fmtTime(slot.start_time)}. Slot is free again.`
      )
    );
  }
}

function toISO(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}
