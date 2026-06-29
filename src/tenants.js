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
