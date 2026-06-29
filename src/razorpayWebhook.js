import { withDirectTxn, query } from "./db.js";
import { getById } from "./tenants.js";
import { getByLinkId } from "./bookings.js";
import { verifyRazorpay } from "./wa/verify.js";
import { send } from "./wa/send.js";
import { buildConfirmation, buildOwnerNotify, buildText } from "./wa/messages.js";
import { refund } from "./payments.js";
import { log } from "./logger.js";

// POST /razorpay/webhook/:tenantId  (each tenant configures this URL in their Razorpay dashboard)
export async function razorpayWebhook(req, res) {
  const tenant = await getById(req.params.tenantId);
  if (!tenant) return res.sendStatus(404);

  const sig = req.headers["x-razorpay-signature"];
  if (!verifyRazorpay(req.rawBody, sig, tenant.razorpay_webhook_secret)) {
    return res.sendStatus(400);
  }
  res.sendStatus(200); // ack fast; process async

  try {
    const body = req.body;
    if (body.event !== "payment_link.paid") return;
    const linkId = body.payload?.payment_link?.entity?.id;
    const paymentId = body.payload?.payment?.entity?.id;
    if (!linkId) return;
    await reconcile(tenant, linkId, paymentId);
  } catch (e) {
    log.error("razorpay_webhook_error", { tenant_id: tenant.id, err: String(e) });
  }
}

async function reconcile(tenant, linkId, paymentId) {
  const booking = await getByLinkId(linkId);
  if (!booking) {
    log.warn("razorpay_unknown_link", { tenant_id: tenant.id, link: linkId });
    return;
  }
  // Idempotency: already finalized.
  if (booking.status === "confirmed" || booking.status === "refunded") return;
  if (booking.razorpay_payment_id) return;

  // Re-acquire the slot at capture time. The reaper may have freed it while the
  // user was paying — if so, refund instead of silently losing the payment.
  const result = await withDirectTxn(async (c) => {
    const sel = await c.query("select * from slots where id = $1 for update", [booking.slot_id]);
    const slot = sel.rows[0];
    const stillOurs = slot && slot.status === "held" && slot.held_by === booking.player_phone;
    if (!stillOurs) return { booked: false, slot };

    await c.query("update slots set status='booked', booking_id=$1 where id=$2", [
      booking.id,
      slot.id,
    ]);
    await c.query(
      "update bookings set status='confirmed', razorpay_payment_id=$1, updated_at=now() where id=$2",
      [paymentId, booking.id]
    );
    return { booked: true, slot };
  });

  if (result.booked) {
    const slot = { ...result.slot, booking_id: booking.id };
    await send(tenant, buildConfirmation(booking.player_phone, tenant, slot));
    if (tenant.owner_wa) {
      await send(
        tenant,
        buildOwnerNotify(tenant.owner_wa, slot, booking.player_name, booking.player_phone)
      );
    }
    log.info("booking_confirmed", {
      tenant_id: tenant.id,
      booking_id: booking.id,
      phone: booking.player_phone,
      payment_id: paymentId,
    });
  } else {
    // Slot gone — auto-refund.
    await query("update bookings set status='refunded', razorpay_payment_id=$1, updated_at=now() where id=$2", [
      paymentId,
      booking.id,
    ]);
    if (paymentId) {
      try {
        await refund(tenant, paymentId, booking.amount_paise);
      } catch (e) {
        log.error("refund_failed", { tenant_id: tenant.id, booking_id: booking.id, err: String(e) });
      }
    }
    await send(
      tenant,
      buildText(
        booking.player_phone,
        "😔 Sorry — that slot was taken before your payment completed. Your money is being refunded. Please book another slot."
      )
    );
    log.warn("booking_refunded_race", {
      tenant_id: tenant.id,
      booking_id: booking.id,
      phone: booking.player_phone,
    });
  }
}
