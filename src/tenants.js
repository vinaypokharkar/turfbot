import { query } from "./db.js";

// Small in-memory cache keyed by phone_number_id and by id.
const byPhone = new Map();
const byId = new Map();

export async function getByPhoneId(phoneNumberId) {
  if (byPhone.has(phoneNumberId)) return byPhone.get(phoneNumberId);
  const { rows } = await query("select * from tenants where phone_number_id = $1", [phoneNumberId]);
  const t = rows[0] || null;
  if (t) {
    byPhone.set(phoneNumberId, t);
    byId.set(t.id, t);
  }
  return t;
}

export async function getById(id) {
  if (byId.has(id)) return byId.get(id);
  const { rows } = await query("select * from tenants where id = $1", [id]);
  const t = rows[0] || null;
  if (t) {
    byId.set(id, t);
    byPhone.set(t.phone_number_id, t);
  }
  return t;
}

export function clearCache() {
  byPhone.clear();
  byId.clear();
}

export async function listAll() {
  const { rows } = await query("select * from tenants order by created_at desc");
  return rows;
}

const COLS = [
  "turf_name",
  "phone_number_id",
  "wa_token",
  "wa_business_phone",
  "owner_wa",
  "razorpay_key_id",
  "razorpay_key_secret",
  "razorpay_webhook_secret",
  "razorpay_test",
  "open_time",
  "close_time",
  "slot_minutes",
  "price_paise",
  "address",
  "maps_url",
];

export async function createTenant(data) {
  const vals = COLS.map((c) => data[c] ?? defaultFor(c));
  const ph = COLS.map((_, i) => `$${i + 1}`).join(",");
  const { rows } = await query(
    `insert into tenants (${COLS.join(",")}) values (${ph})
     on conflict (phone_number_id) do update set ${COLS.filter((c) => c !== "phone_number_id")
       .map((c) => `${c}=excluded.${c}`)
       .join(",")}
     returning *`,
    vals
  );
  clearCache();
  return rows[0];
}

export async function updateTenant(id, data) {
  const vals = COLS.map((c) => data[c] ?? defaultFor(c));
  const set = COLS.map((c, i) => `${c}=$${i + 1}`).join(",");
  const { rows } = await query(`update tenants set ${set} where id=$${COLS.length + 1} returning *`, [
    ...vals,
    id,
  ]);
  clearCache();
  return rows[0];
}

function defaultFor(c) {
  const d = {
    razorpay_test: true,
    open_time: "06:00",
    close_time: "23:00",
    slot_minutes: 60,
    price_paise: 90000,
  };
  return c in d ? d[c] : null;
}
