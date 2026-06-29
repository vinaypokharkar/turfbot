# Go-Live Runbook — Turf WhatsApp Bot

Follow top to bottom. Order matters. Estimated time: ~3–5 hours active work, plus
1–3 days waiting on Meta Business Verification + template approval (start those early).

Legend: 🖥️ = on your machine · 🌐 = in a web dashboard · ⏳ = has waiting time.

---

## Phase 0 — Prerequisites (15 min)

- [ ] Node 20+ installed (`node --version`).
- [ ] A phone number for the bot that is **NOT** registered on any WhatsApp / WhatsApp
      Business app. (If it is, delete that WhatsApp account first.)
- [ ] A Razorpay account (test mode is fine to start).
- [ ] A Facebook account + a Meta Business Portfolio (business.facebook.com).
- [ ] Business documents ready (GST / Udyam / utility bill) — needed for Meta verification.

---

## Phase 1 — Database (Supabase) (20 min) 🌐🖥️

1. 🌐 supabase.com → New Project. Pick region **Mumbai (ap-south-1)**. Set a DB password.
2. 🌐 Project → Settings → Database → **Connection string**:
   - Copy **Transaction pooler** URI (port **6543**) → this is `DATABASE_URL`.
   - Copy **Direct connection** URI (port **5432**) → this is `DIRECT_URL`.
   - Replace `[YOUR-PASSWORD]` in both.
3. 🖥️ In `D:\turf-whatsapp-bot`:
   ```bash
   npm install
   cp .env.example .env
   ```
4. 🖥️ Edit `.env` → paste `DATABASE_URL` and `DIRECT_URL`.
5. 🖥️ Create the schema:
   ```bash
   npm run db:schema
   ```
   Expect: `applied db/schema.sql`.
6. 🖥️ (Optional) seed dummy turf + slots for local testing:
   ```bash
   npm run db:seed
   ```

✅ Checkpoint: in Supabase → Table Editor you see `tenants, slots, bookings,
conversations, processed_messages`.

---

## Phase 2 — Meta WhatsApp app (30 min + ⏳ verification) 🌐

1. 🌐 developers.facebook.com → My Apps → **Create App** → type **Business**.
2. Add product **WhatsApp** → Set up.
3. It auto-creates a test number. Note the **Phone number ID** and **temporary token**
   (top of WhatsApp → API Setup). Good for first smoke test (token expires in 24h).
4. 🌐 App → Settings → Basic → copy **App Secret** → put in `.env` as `APP_SECRET`.
5. 🖥️ Choose a random string for `VERIFY_TOKEN` in `.env` (any value; you'll reuse it).
6. ⏳ **Start Meta Business Verification now** (Business Settings → Security Center).
   Takes 1–3 days. Until verified you're limited to a small tier — fine for testing,
   required before real volume.
7. ⏳ **Submit message templates now** (WhatsApp Manager → Message Templates). Copy the
   three from `templates/README.md` (`booking_reminder`, `owner_new_booking`,
   `owner_cancellation`). Approval takes minutes–hours and can be rejected. The booking
   confirmation itself is free-form (no template), so the core flow works without these.

> Permanent token (do after first smoke test works): Business Settings → System Users →
> create an **Admin** system user → Add Assets (your app) → **Generate token** with
> `whatsapp_business_messaging` + `whatsapp_business_management`, expiry **Never**.
> Put it in your tenant row (`wa_token`), not `.env`.

---

## Phase 3 — Deploy to Railway (25 min) 🌐🖥️

1. 🖥️ Make it a git repo and push (Railway deploys from GitHub):
   ```bash
   cd /d/turf-whatsapp-bot
   git init && git add . && git commit -m "init turf bot"
   ```
   Create a GitHub repo (`gh repo create` or on github.com) and push.
2. 🌐 railway.app → New Project → **Deploy from GitHub repo** → pick the repo.
3. 🌐 Railway → your service → **Variables** → add every var from `.env`:
   `DATABASE_URL, DIRECT_URL, VERIFY_TOKEN, APP_SECRET, PORT=3000, PUBLIC_BASE_URL,
   HOLD_MINUTES, LINK_EXPIRY_MINUTES, REAPER_SECONDS, CANCEL_HOURS, STALE_MINUTES,
   MAX_DAILY_HOLDS, TZ=Asia/Kolkata`.
4. 🌐 Railway → Settings → Networking → **Generate Domain**. Copy it
   (e.g. `https://turf-bot-production.up.railway.app`).
5. 🌐 Set `PUBLIC_BASE_URL` variable to that domain. Redeploy.
6. ✅ Checkpoint: open `https://<domain>/health` → `{"ok":true}`.

> Keep the service always-on (Railway does by default). Do NOT use Render free — it
> sleeps and would drop incoming bookings.

---

## Phase 4 — Wire the Meta webhook (10 min) 🌐

1. 🌐 Meta App → WhatsApp → **Configuration** → Webhook → Edit:
   - Callback URL: `https://<your-railway-domain>/webhook`
   - Verify token: your `VERIFY_TOKEN`
   - Click **Verify and Save** (this hits `GET /webhook` — should succeed instantly).
2. 🌐 Under **Webhook fields**, subscribe to **messages**.
3. ✅ Checkpoint: Railway logs show `server_up`. From your personal WhatsApp, send "Hi"
   to the bot test number → you should get the menu. (For the test number, your personal
   number must be added as a recipient in API Setup → "To".)

---

## Phase 5 — Onboard the first real turf (15 min) 🖥️🌐

1. 🌐 Razorpay → Settings → API Keys → generate **Key ID + Secret** (test mode first).
2. 🖥️ Onboard the tenant (this prints the exact Razorpay webhook URL):
   ```bash
   node scripts/onboard-tenant.js '{
     "turf_name":"GreenField Turf Panvel",
     "phone_number_id":"<META_PHONE_NUMBER_ID>",
     "wa_token":"<PERMANENT_TOKEN>",
     "owner_wa":"91XXXXXXXXXX",
     "razorpay_key_id":"rzp_test_xxx",
     "razorpay_key_secret":"xxx",
     "razorpay_webhook_secret":"<choose-a-secret>",
     "razorpay_test":true,
     "open_time":"06:00","close_time":"23:00",
     "price_paise":90000,
     "address":"Plot 5, New Panvel",
     "maps_url":"https://maps.google.com/?q=..."
   }'
   ```
   Note the printed `tenant ready: <id>` and the webhook URL.
3. 🖥️ Generate slots for that tenant:
   ```bash
   node scripts/generate-slots.js <tenant-id>
   ```
4. 🌐 Razorpay → Settings → **Webhooks** → Add:
   - URL: `https://<domain>/razorpay/webhook/<tenant-id>`
   - Secret: the same `razorpay_webhook_secret` you set above.
   - Active event: **payment_link.paid**.

---

## Phase 6 — QA in test mode (30 min) 📱

Razorpay still in **test mode**. Run each, confirm result:

1. Send "Hi" → menu appears.
2. Book → Tomorrow → tap a slot → Confirm & Pay → enter name → pay link arrives.
3. Pay the link with a Razorpay **test card** → confirmation message arrives + owner
   gets a notify.
4. Re-open Book → Tomorrow → the booked slot is **gone** from the list.
5. Start a booking, get the pay link, **don't pay** → after `HOLD_MINUTES` the slot
   reappears free (check Railway logs for `reaper_freed`).
6. Two phones tap the same slot fast → one gets Confirm, the other "just taken".
7. `CANCEL <id>` more than 4h before the slot → cancelled + slot freed; less than 4h →
   refused.

✅ All seven pass → ready for real money.

---

## Phase 7 — Flip to live (10 min) 🌐🖥️

1. ⏳ Confirm Meta Business Verification is **approved** and templates are **approved**.
2. 🌐 Razorpay → switch to **Live mode** → generate **live** keys + a **live** webhook
   (same URL, new secret).
3. 🖥️ Re-run onboard for the tenant with live keys + `"razorpay_test":false`:
   ```bash
   node scripts/onboard-tenant.js '{ ...same..., "razorpay_key_id":"rzp_live_...", "razorpay_key_secret":"...", "razorpay_webhook_secret":"<live-secret>", "razorpay_test":false }'
   ```
   (Restart the Railway service so the tenant cache reloads, or it refreshes on next boot.)
4. 🌐 Do ONE real ₹ booking yourself end-to-end. Verify money lands in the turf owner's
   Razorpay account and confirmation arrives.

---

## Phase 8 — Operate (ongoing) 🌐

- [ ] UptimeRobot (free) → monitor `https://<domain>/health` every 5 min.
- [ ] Railway **Cron**: run `node scripts/generate-slots.js` daily (keeps ~7 days of
      slots ahead). Without this, slots run out.
- [ ] Watch Railway logs for `reaper_freed`, `booking_confirmed`, `booking_refunded_race`.
      Frequent `booking_refunded_race` = holds/reaper mistuned.
- [ ] Add a turf later = Phase 5 only (onboard + slots + Razorpay webhook). No redeploy.

---

## Rollback

- Bad deploy → Railway → Deployments → **Redeploy** a previous good build.
- Stop taking bookings fast → Railway → remove the **messages** webhook subscription in
  Meta (bot goes silent; no data lost).
- Money issue → Razorpay dashboard handles refunds; `cancel.js` / race-path already
  auto-refund. Manual refund via Razorpay if needed.
