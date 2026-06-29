-- Turf booking bot schema. Apply: npm run db:schema
create extension if not exists pgcrypto;

create table if not exists tenants (
  id                      uuid primary key default gen_random_uuid(),
  turf_name               text not null,
  phone_number_id         text unique not null,      -- Meta phone_number_id (routing key)
  wa_token                text not null,             -- Meta permanent token
  wa_business_phone       text,                      -- display number
  owner_wa                text,                       -- owner's whatsapp for booking notifications
  razorpay_key_id         text,
  razorpay_key_secret     text,
  razorpay_webhook_secret text,
  razorpay_test           boolean not null default true,
  open_time               time not null default '06:00',
  close_time              time not null default '23:00',
  slot_minutes            int  not null default 60,
  price_paise             int  not null default 90000,
  address                 text,
  maps_url                text,
  created_at              timestamptz not null default now()
);

create table if not exists slots (
  id           bigserial primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  slot_date    date not null,
  start_time   time not null,
  end_time     time not null,
  price_paise  int  not null,
  status       text not null default 'free',         -- free | held | booked
  hold_expires timestamptz,
  held_by      text,                                  -- phone holding the slot
  booking_id   bigint,
  created_at   timestamptz not null default now(),
  unique (tenant_id, slot_date, start_time)
);
create index if not exists slots_lookup on slots (tenant_id, slot_date, status);
create index if not exists slots_hold on slots (status, hold_expires);

create table if not exists bookings (
  id                   bigserial primary key,
  tenant_id            uuid not null references tenants(id) on delete cascade,
  slot_id              bigint not null references slots(id),
  player_phone         text not null,
  player_name          text,
  amount_paise         int  not null,
  razorpay_link_id     text,
  razorpay_payment_id  text,
  status               text not null default 'pending', -- pending | confirmed | cancelled | refunded
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists bookings_lookup on bookings (tenant_id, player_phone, status);
create index if not exists bookings_link on bookings (razorpay_link_id);

create table if not exists conversations (
  tenant_id  uuid not null,
  phone      text not null,
  state      text not null default 'START',
  context    jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, phone)
);

-- Inbound webhook idempotency (Meta retries deliver same message.id).
create table if not exists processed_messages (
  message_id text primary key,
  created_at timestamptz not null default now()
);
