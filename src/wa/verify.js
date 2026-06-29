import crypto from "crypto";

// Meta inbound webhook: header 'x-hub-signature-256' = 'sha256=' + HMAC(appSecret, rawBody).
export function verifyMeta(rawBody, header, appSecret) {
  if (!header || !appSecret || !rawBody) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEq(header, expected);
}

// Razorpay webhook: header 'x-razorpay-signature' = HMAC(webhookSecret, rawBody) hex.
export function verifyRazorpay(rawBody, header, secret) {
  if (!header || !secret || !rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEq(header, expected);
}

function safeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
