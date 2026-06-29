// Generate hourly slot rows for the next N days. Run daily (cron) or on demand.
//   node scripts/generate-slots.js              -> all tenants, next 7 days
//   node scripts/generate-slots.js <tenantId>   -> one tenant
//   node scripts/generate-slots.js <tenantId> 14 -> one tenant, next 14 days
import { query, close } from "../src/db.js";

const tenantId = process.argv[2] || null;
const days = Number(process.argv[3] || 7);

try {
  const { rowCount } = await query(
    `insert into slots (tenant_id, slot_date, start_time, end_time, price_paise)
     select t.id,
            d::date,
            (t.open_time + (h || ' hours')::interval)::time,
            (t.open_time + ((h + 1) || ' hours')::interval)::time,
            t.price_paise
       from tenants t
       cross join generate_series(current_date, current_date + ($2::int - 1), interval '1 day') d
       cross join generate_series(
         0,
         (extract(hour from t.close_time) - extract(hour from t.open_time))::int - 1
       ) h
      where ($1::uuid is null or t.id = $1::uuid)
     on conflict (tenant_id, slot_date, start_time) do nothing`,
    [tenantId, days]
  );
  console.log(`generated ${rowCount} new slots (${days} days${tenantId ? ", tenant " + tenantId : ", all tenants"})`);
} catch (e) {
  console.error("generate-slots failed:", e.message);
  process.exitCode = 1;
} finally {
  await close();
}
