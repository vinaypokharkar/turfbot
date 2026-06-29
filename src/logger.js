// Structured JSON logger with phone masking (never log full numbers / tokens).

export function mask(phone) {
  if (!phone) return phone;
  const s = String(phone);
  return s.length <= 4 ? "****" : "***" + s.slice(-4);
}

function emit(level, msg, fields = {}) {
  const rec = { level, msg, ...fields };
  if (rec.phone) rec.phone = mask(rec.phone);
  // strip anything that smells like a secret
  delete rec.wa_token;
  delete rec.razorpay_key_secret;
  delete rec.razorpay_webhook_secret;
  console.log(JSON.stringify(rec));
}

export const log = {
  info: (msg, f) => emit("info", msg, f),
  warn: (msg, f) => emit("warn", msg, f),
  error: (msg, f) => emit("error", msg, f),
};
