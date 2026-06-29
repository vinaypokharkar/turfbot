-- Dummy seed for local dev. Apply: npm run db:seed
-- Replace TEST_* creds before sending real WhatsApp / Razorpay traffic.

insert into tenants (
  id, turf_name, phone_number_id, wa_token, wa_business_phone, owner_wa,
  razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret, razorpay_test,
  open_time, close_time, slot_minutes, price_paise, address, maps_url
) values (
  '00000000-0000-0000-0000-000000000001',
  'GreenField Turf Panvel',
  'TEST_PHONE_ID',
  'TEST_WA_TOKEN',
  '919999999999',
  '919999999999',
  'rzp_test_xxxxxxxx',
  'rzp_test_secret_xxxxxxxx',
  'rzp_webhook_secret_xxxxxxxx',
  true,
  '06:00', '23:00', 60, 90000,
  'Plot 5, Sector 12, New Panvel',
  'https://maps.google.com/?q=New+Panvel'
)
on conflict (id) do nothing;

-- Generate hourly slots for the next 7 days for the demo tenant.
insert into slots (tenant_id, slot_date, start_time, end_time, price_paise)
select
  t.id,
  d::date,
  (t.open_time + (h || ' hours')::interval)::time,
  (t.open_time + ((h + 1) || ' hours')::interval)::time,
  t.price_paise
from tenants t
cross join generate_series(current_date, current_date + 6, interval '1 day') d
cross join generate_series(
  0,
  (extract(hour from t.close_time) - extract(hour from t.open_time))::int - 1
) h
where t.id = '00000000-0000-0000-0000-000000000001'
on conflict (tenant_id, slot_date, start_time) do nothing;
