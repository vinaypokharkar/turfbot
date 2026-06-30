import { query } from "./db.js";

export async function createBooking(tenantId, slot, phone, name) {
  const { rows } = await query(
    `insert into bookings (tenant_id, slot_id, player_phone, player_name, amount_paise, status)
     values ($1, $2, $3, $4, $5, 'pending') returning *`,
    [tenantId, slot.id, phone, name || null, slot.price_paise]
  );
  return rows[0];
}

export async function setBookingLink(bookingId, linkId) {
  await query("update bookings set razorpay_link_id = $1, updated_at = now() where id = $2", [
    linkId,
    bookingId,
  ]);
}

export async function getByLinkId(linkId) {
  const { rows } = await query("select * from bookings where razorpay_link_id = $1", [linkId]);
  return rows[0] || null;
}

export async function getBookingById(tenantId, id) {
  const { rows } = await query("select * from bookings where id = $1 and tenant_id = $2", [
    id,
    tenantId,
  ]);
  return rows[0] || null;
}

// Upcoming confirmed bookings for a player, with slot times joined.
export async function getUpcoming(tenantId, phone) {
  const { rows } = await query(
    `select b.id, s.slot_date, s.start_time, s.end_time
       from bookings b join slots s on s.id = b.slot_id
      where b.tenant_id = $1 and b.player_phone = $2 and b.status = 'confirmed'
        and (s.slot_date + s.start_time) > now()
      order by s.slot_date, s.start_time limit 10`,
    [tenantId, phone]
  );
  return rows;
}

// Recent bookings for the admin dashboard (any status), with slot times.
export async function listByTenant(tenantId, limit = 50) {
  const { rows } = await query(
    `select b.id, b.player_name, b.player_phone, b.amount_paise, b.status, b.created_at,
            s.slot_date, s.start_time, s.end_time
       from bookings b join slots s on s.id = b.slot_id
      where b.tenant_id = $1
      order by b.created_at desc limit $2`,
    [tenantId, limit]
  );
  return rows;
}

export async function countTodayAttempts(tenantId, phone) {
  const { rows } = await query(
    "select count(*)::int n from bookings where tenant_id = $1 and player_phone = $2 and created_at >= current_date",
    [tenantId, phone]
  );
  return rows[0].n;
}
