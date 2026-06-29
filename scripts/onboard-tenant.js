// Onboard a new turf WITHOUT redeploying. Pass a JSON file or inline JSON.
//   node scripts/onboard-tenant.js tenant.json
//   node scripts/onboard-tenant.js '{"turf_name":"...","phone_number_id":"...", ...}'
//
// Required: turf_name, phone_number_id, wa_token
// Optional: owner_wa, razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret,
//           razorpay_test, open_time, close_time, slot_minutes, price_paise, address, maps_url
import fs from "fs";
import { query, close } from "../src/db.js";
import { CONFIG } from "../src/config.js";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/onboard-tenant.js <tenant.json | inline-json>");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.existsSync(arg) ? fs.readFileSync(arg, "utf8") : arg);
} catch (e) {
  console.error("invalid JSON:", e.message);
  process.exit(1);
}

for (const k of ["turf_name", "phone_number_id", "wa_token"]) {
  if (!data[k]) {
    console.error(`missing required field: ${k}`);
    process.exit(1);
  }
}

try {
  const { rows } = await query(
    `insert into tenants
       (turf_name, phone_number_id, wa_token, wa_business_phone, owner_wa,
        razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret, razorpay_test,
        open_time, close_time, slot_minutes, price_paise, address, maps_url)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (phone_number_id) do update set
        turf_name=excluded.turf_name, wa_token=excluded.wa_token,
        owner_wa=excluded.owner_wa, razorpay_key_id=excluded.razorpay_key_id,
        razorpay_key_secret=excluded.razorpay_key_secret,
        razorpay_webhook_secret=excluded.razorpay_webhook_secret
     returning id`,
    [
      data.turf_name,
      data.phone_number_id,
      data.wa_token,
      data.wa_business_phone || null,
      data.owner_wa || null,
      data.razorpay_key_id || null,
      data.razorpay_key_secret || null,
      data.razorpay_webhook_secret || null,
      data.razorpay_test ?? true,
      data.open_time || "06:00",
      data.close_time || "23:00",
      data.slot_minutes || 60,
      data.price_paise || 90000,
      data.address || null,
      data.maps_url || null,
    ]
  );
  const id = rows[0].id;
  console.log(`tenant ready: ${id}`);
  if (CONFIG.PUBLIC_BASE_URL) {
    console.log(`Razorpay webhook URL → ${CONFIG.PUBLIC_BASE_URL}/razorpay/webhook/${id}`);
  }
  console.log(`Next: node scripts/generate-slots.js ${id}`);
} catch (e) {
  console.error("onboard failed:", e.message);
  process.exitCode = 1;
} finally {
  await close();
}
