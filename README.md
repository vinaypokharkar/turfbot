# Turf Booking WhatsApp Bot

Multi-tenant WhatsApp booking bot for turf owners. Built on **Meta WhatsApp Cloud API
(direct, no BSP)** + **Node/Express** + **Supabase Postgres** + **Razorpay**.
One deployment serves many turfs; add a turf by running a script — no redeploy.

See `PLAN.md` for the full design, edge cases, and ADR.

## Architecture

```
Player WhatsApp → Meta Cloud API → POST /webhook → flow (state machine)
                                          │
                                          ├─ slots  (Postgres, SELECT FOR UPDATE on direct conn)
                                          ├─ Razorpay payment link
                                          └─ POST /razorpay/webhook/:tenantId → confirm or auto-refund
reaper (interval) frees expired holds
```

Routing: every client number lives under your Meta App → one webhook → tenant
resolved by `phone_number_id`. Every row carries `tenant_id`.

## Setup

1. **Install**
   ```bash
   npm install
   cp .env.example .env   # fill in values
   ```

2. **Database (Supabase)** — set both `DATABASE_URL` (pooler 6543) and
   `DIRECT_URL` (5432). The direct URL is mandatory: slot locks use it.
   ```bash
   npm run db:schema
   npm run db:seed        # dummy GreenField Turf + 7 days of slots
   ```

3. **Meta WhatsApp Cloud API** — create App (Business) → add WhatsApp → get
   `phone_number_id` + permanent token + App Secret. Set webhook to
   `https://<your-app>/webhook`, verify token = `VERIFY_TOKEN`, subscribe to
   `messages`. Submit templates in `templates/README.md` on day one.

4. **Razorpay** — per tenant: create keys + a webhook pointing at
   `https://<your-app>/razorpay/webhook/<tenantId>`, event `payment_link.paid`,
   secret = tenant's `razorpay_webhook_secret`. Keep `razorpay_test=true` until QA passes.

5. **Run**
   ```bash
   npm start        # or: npm run dev
   npm test         # pure unit tests (no DB needed)
   ```

## Onboard a new turf (no redeploy)

```bash
node scripts/onboard-tenant.js '{"turf_name":"Acers Panvel","phone_number_id":"123","wa_token":"EAA...","owner_wa":"9198...","razorpay_key_id":"rzp_live_...","razorpay_key_secret":"...","razorpay_webhook_secret":"...","price_paise":100000}'
node scripts/generate-slots.js <printed-tenant-id>
```
The onboard script prints the exact Razorpay webhook URL to paste into that
turf's Razorpay dashboard.

## Deploy (Railway)

- One web service (this app) + Supabase Postgres (external, free).
- Railway stays always-on (Render free sleeps → don't use it for the webhook).
- Set all `.env` vars in Railway. Healthcheck: `/health`.
- Add a UptimeRobot monitor on `/health` to detect downtime.
- Schedule `node scripts/generate-slots.js` daily (Railway cron) to keep slots ahead.

## Key safety properties

- **No double-booking:** `holdSlot` uses `SELECT ... FOR UPDATE` on the direct
  (non-pooled) connection.
- **No paid-but-no-slot:** payment is reconciled at capture; if the slot was freed
  meanwhile, the payment is **auto-refunded** + the player is told.
- **Idempotent:** inbound dedupe on `message.id`; payment dedupe on booking state +
  `payment_id`.
- **Signed:** Meta + Razorpay webhooks are HMAC-verified on the raw body.
- **Anti-abuse:** one active hold per phone + daily attempt cap.

## Default booking rules (env-tunable)

| Var | Default | Meaning |
|-----|---------|---------|
| `HOLD_MINUTES` | 10 | how long a slot is held for payment |
| `LINK_EXPIRY_MINUTES` | 20 | Razorpay link expiry (min 15 enforced by Razorpay) |
| `REAPER_SECONDS` | 60 | how often expired holds are freed |
| `CANCEL_HOURS` | 4 | min notice to cancel |
| `STALE_MINUTES` | 30 | abandoned conversation reset |
| `MAX_DAILY_HOLDS` | 10 | per-phone daily booking attempts |
```
