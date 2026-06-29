import Razorpay from "razorpay";
import { CONFIG } from "./config.js";
import { fmtDate, fmtTime } from "./util.js";

function client(tenant) {
  return new Razorpay({
    key_id: tenant.razorpay_key_id,
    key_secret: tenant.razorpay_key_secret,
  });
}

// Create a Razorpay payment link for a booking. Amount is in PAISE.
// Note: Razorpay enforces a 15-min minimum on expire_by, so the link can outlive
// our HOLD_MINUTES. The capture-time re-acquire + auto-refund in razorpayWebhook.js
// is what actually guards the race — not link expiry.
export async function createPaymentLink(tenant, booking, slot) {
  const rz = client(tenant);
  const expireBy = Math.floor(Date.now() / 1000) + Math.max(15, CONFIG.LINK_EXPIRY_MINUTES) * 60;
  const link = await rz.paymentLink.create({
    amount: slot.price_paise, // paise
    currency: "INR",
    accept_partial: false,
    description: `${tenant.turf_name} ${fmtDate(slot.slot_date)} ${fmtTime(slot.start_time)}`,
    customer: { contact: "+" + booking.player_phone, name: booking.player_name || undefined },
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: expireBy,
    notes: { booking_id: String(booking.id), tenant_id: tenant.id },
  });
  return { id: link.id, url: link.short_url };
}

export async function refund(tenant, paymentId, amountPaise) {
  const rz = client(tenant);
  return rz.payments.refund(paymentId, { amount: amountPaise, speed: "optimum" });
}
