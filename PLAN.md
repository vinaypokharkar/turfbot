# Turf Booking WhatsApp Bot — Implementation Plan (v2)

**Status: PENDING APPROVAL** (no source code written yet)
**Date:** 2026-06-29 · **Rev:** v2 (post plan-review patch)
**Classification:** New build (greenfield, discovery-focused)

> v2 changelog: fixed pay-vs-reaper race (BLOCKER), added cancellation step (BLOCKER),
> interactive-reply parsing, hold-spam rate limit, Supabase pooler lock fix, raw-body
> signature capture, early template submission, message dedupe, timezone policy,
> owner notification, refund-on-fail path.

---

## 1. Requirements summary

Build a **multi-tenant WhatsApp booking bot** for turf owners (start: Panvel). One
deployment serves 3–4 turf clients now, scales to dozens. Players book + pay slots
entirely inside WhatsApp. Owner gets confirmed, prepaid, double-booking-free slots.

**Core capabilities**
- WhatsApp conversational booking (menu → date → slot → confirm → pay → confirmed).
- Real-time slot availability from a single source of truth (no double-booking).
- UPI payment via Razorpay payment links; slot locked only after captured payment reconciles.
- Cancellation by player (4h+ before slot).
- Multi-tenant: route by `phone_number_id`, isolate all data by `tenant_id`.
- Confirmation + reminder + owner-notify via WhatsApp.

**Stack (decided in conversation)**
- Meta WhatsApp **Cloud API direct** (₹0 platform, only per-msg ₹0.115 utility). No BSP.
- **Node + Express** webhook backend.
- **Supabase Postgres** (free 500MB) — **direct connection (port 5432) for lock txns**, not the 6543 pooler.
- **Razorpay** payment links (per-tenant keys), **test mode** until go-live.
- Host: **Railway** (always-on; Render free sleeps → rejected).
- Timezone: **Asia/Kolkata (IST)** everywhere; store timestamps `timestamptz`.

**Out of scope (v1)**: player app, owner dashboard UI, marketing blasts, multi-sport,
recurring bookings, automated refund-policy tiers (manual/full refund only in v1).

---

## 2. Acceptance criteria (testable)

- [ ] `GET /webhook` returns `hub.challenge` when `hub.verify_token` matches env; 403 otherwise.
- [ ] `POST /webhook` returns 200 in <5s for any payload (ack-fast), processes async.
- [ ] Inbound parser handles **text**, `interactive.button_reply.id`, AND `interactive.list_reply.id`.
- [ ] Duplicate inbound `message.id` is skipped (dedupe table) — no double processing.
- [ ] Unknown `phone_number_id` → ignored, logged, no crash.
- [ ] "Hi" → interactive 3-button menu (Book / My Bookings / Prices).
- [ ] "My Bookings" lists this phone's upcoming `booked` slots; "Prices" returns tenant info text.
- [ ] "Book" → date buttons → slot **list shows only `status='free'`** slots for tenant+date+IST.
- [ ] Tapping a slot runs `holdSlot` in a txn on a **direct (non-pooled) connection** with `SELECT ... FOR UPDATE`; second concurrent tap on same slot → "taken, pick another".
- [ ] A phone may hold **max 1** slot at a time; further holds rejected until paid/released.
- [ ] Held slot auto-releases after `HOLD_MINUTES` (10) **+ grace**; payment link expires *before* hold (8 min) so capture can't outrace reaper.
- [ ] `payment.captured` (signature-verified, **raw body**) re-acquires the slot in a txn; if still held by this booking → `booked`; **if not bookable → auto-refund + apology msg**.
- [ ] Duplicate `payment.captured` (same `payment_id`) is idempotent — single confirmation.
- [ ] Razorpay amount sent in **paise** (₹900 → 90000).
- [ ] On confirm: player gets confirmation; **owner gets a notify message** of the new booking.
- [ ] `CANCEL <id>` ≥4h before slot → slot freed + manual/auto refund flagged; <4h → refused.
- [ ] Every DB query filters by `tenant_id`; test proves Turf A cannot read Turf B rows.
- [ ] Conversation state persists per `(tenant_id, phone)`; stale (>30 min) resets to START.
- [ ] `npm test` passes; `npm run lint` clean.

---

## 3. Implementation steps (7)

### Step 1 — Skeleton + config + DB schema + template submission
**Files:** `package.json`, `.env.example`, `src/config.js`, `src/db.js`, `db/schema.sql`, `db/seed.sql`, `templates/README.md`
- Express app, env, two pg pools: **pooled** (general) + **direct 5432** (lock txns).
- `schema.sql`: `tenants`, `slots`, `bookings`, `conversations`, **`processed_messages`** (dedupe), all with `tenant_id`; timestamps `timestamptz`; session tz `Asia/Kolkata`.
- `templates/README.md`: exact **confirmation + reminder + owner-notify** template text — **submit to Meta on day 1** (approval has lead time + can reject).
**Acceptance:** schema applies; `npm start` boots; `/health` 200; both pools connect.

### Step 2 — Webhook ingress + inbound parser + tenant routing + state + dedupe
**Files:** `src/webhook.js`, `src/inbound.js`, `src/tenants.js`, `src/state.js`, `src/wa/verify.js`
- `GET/POST /webhook`; Meta signature verify using **raw body** (`express.json({verify})`).
- `inbound.js`: normalize text / `button_reply.id` / `list_reply.id` → `{type, value, messageId}`.
- Dedupe on `message.id` via `processed_messages` (insert-or-skip).
- Resolve tenant by `phone_number_id`; drop unknown. State get/set keyed `(tenant_id, phone)`; reset if stale >30 min.
**Acceptance:** GET challenge works; POST acks <5s; bad signature 400; interactive + text both parse; replayed `message.id` skipped; unknown number ignored.

### Step 3 — WhatsApp send helpers + message builders
**Files:** `src/wa/send.js`, `src/wa/messages.js`
- `sendText`, `sendButtons`, `sendList`, `sendTemplate` via Graph `v21.0`, per-tenant token.
- Builders: menu, date buttons, slot list, confirm buttons, pay link, my-bookings, prices.
- **Confirmation = free-form text** (sent within 24h window, right after chat) → no template dependency; **reminder + owner-notify = templates** (may fire outside window).
**Acceptance:** unit tests assert valid Cloud API JSON per builder; manual send renders interactive UI on test number.

### Step 4 — Booking state machine + slot lock + anti-abuse
**Files:** `src/flow.js`, `src/slots.js`
- States: `START→MENU→PICK_DATE→PICK_SLOT→CONFIRM→PAYMENT→DONE`. Handlers for Book, My Bookings, Prices.
- `slots.holdSlot(tenant, slotId, phone)` = txn on **direct connection**, `SELECT ... FOR UPDATE`, reject if not free, set `held` + `hold_expires = now() + HOLD_MINUTES`.
- **Rate limit:** reject hold if phone already has an active `held` slot; cap N hold attempts/phone/day.
- `slots.listFree`, `slots.freeSlot`, `slots.bookSlot(bookingId)`.
**Acceptance:** concurrency test — 2 parallel `holdSlot` same slot → exactly one wins. Second active hold by same phone rejected. Flow advances per inbound reply id.

### Step 5 — Razorpay link + payment webhook + reconciliation/refund
**Files:** `src/payments.js`, `src/razorpayWebhook.js`
- Create payment link (tenant keys, **test mode** flag, amount in **paise**), link expiry = `HOLD_MINUTES - 2`; store `razorpay_id`.
- `POST /razorpay/webhook`: verify HMAC on **raw body**; idempotent on `payment_id`.
- On `payment.captured`: **txn re-acquire slot** → if held-by-this-booking → `booked` + confirm player + notify owner; **else auto-refund (Razorpay refund API) + apology msg**.
**Acceptance:** signed payload books once; replay = no-op; bad signature 400; simulated reaper-freed-slot path triggers refund + apology, not silent loss.

### Step 6 — Reaper + onboarding + slot gen + deploy
**Files:** `src/reaper.js`, `scripts/onboard-tenant.js`, `scripts/generate-slots.js`, `railway.json`/`Procfile`, `README.md`
- Reaper interval = `REAPER_SECONDS` (60); frees `held` past `hold_expires` (grace > link expiry).
- `onboard-tenant.js`: CLI insert turf (number, token, razorpay keys, hours, price) — **add turf = run script, no redeploy**.
- `generate-slots.js`: daily slot rows per tenant in IST.
**Acceptance:** expired hold freed within 1 cycle (after grace); onboarding adds Turf #4 by insert; Railway boots always-on; `/health` green.

### Step 7 — Cancellation flow (NEW)
**Files:** `src/cancel.js` (+ wire into `src/flow.js`)
- Parse `CANCEL <booking_id>` (or My Bookings → Cancel button).
- Verify booking belongs to phone + tenant; check ≥`CANCEL_HOURS` (4) before slot start.
- ≥4h → txn: slot→`free`, booking→`cancelled`, trigger Razorpay refund (test mode v1), notify player + owner. <4h → refuse with reason.
**Acceptance:** valid cancel ≥4h frees slot + flags refund + notifies both parties; <4h refused; foreign booking id rejected.

---

## 4. Edge cases & error states

| Case | Handling |
|---|---|
| Slot taken between list render and tap | `holdSlot` txn fails → "just got taken" → re-show list |
| Two users tap same slot | `SELECT FOR UPDATE` (direct conn) → one wins |
| **Pay just as reaper fires** | link expires before hold; on capture, txn re-acquire; if lost → **auto-refund + apology** (no silent loss) |
| Payment link never paid | hold + expiry → reaper frees (after grace) |
| Razorpay webhook twice | idempotent on `payment_id` |
| Inbound webhook retried (Meta) | dedupe on `message.id` |
| User types free text mid-flow | re-prompt current state; 3 nudges then reset MENU |
| Abandon + return next day | stale state >30 min → reset START |
| **Hold-spam abuse** | max 1 active hold/phone + daily attempt cap |
| Unknown `phone_number_id` | ignore + log |
| 24h window expired | reminder/owner-notify use templates; confirmation usually in-window (free-form) |
| Wrong tenant Razorpay key | caught, logged per tenant; "payment temporarily unavailable" |
| Fully booked day | "No slots free on {date}" + date buttons |
| Player uses 2 turfs | state keyed `(tenant_id, phone)` |
| Cancel <4h before | refused with reason |
| Cancel of foreign/other booking id | rejected (ownership + tenant check) |
| Timezone | all IST; `timestamptz`; `now()` UTC compared correctly |

---

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Double-booking** | direct-connection txn `SELECT FOR UPDATE` (NOT via pgBouncer pooler) + held/expiry |
| **Paid-but-no-slot** | link expiry < hold expiry + capture-time re-acquire + auto-refund |
| **Hold-spam DoS** | per-phone active-hold cap + daily attempt cap |
| **Number ban** | Cloud API official only; no Baileys/whatsapp-web.js; respect 24h + templates |
| **Webhook dup processing** | dedupe `message.id` + idempotent `payment_id` |
| **Signature spoofing** | HMAC verify on **raw body** for Meta + Razorpay |
| **Cross-tenant leak** | mandatory `tenant_id` filter; isolation test |
| **Template approval delay/reject** | submit day 1; confirmation uses free-form fallback |
| **Meta Business Verification** | tracked as go-live gate (days, needs biz docs) |
| **Token leak** | env/DB only, never logged; `.env` gitignored |
| **Service sleep** | Railway always-on + UptimeRobot on `/health` |
| **Owner lacks Razorpay KYC** | onboarding blocker — see §9; fallback shared account option |
| **Real-money bug** | Razorpay **test mode** until full QA passes |

---

## 6. Observability

**Backend:**
- Structured logs: `tenant_id`, masked `phone`, `state`, `event`, `message.id`, `payment_id`.
- Log every state transition + slot status change (free→held→booked→free) + cancel.
- Payment lifecycle: link created, captured, idempotent-skip, signature-fail, refund-issued.
- Sentry (or console + log drain) on unhandled webhook errors.
- `/health` for UptimeRobot (free) → detects sleep/crash.

**Silent-break detection (alerts):**
- 0 `payment.captured` in N open-hours → pipeline dead.
- `held` slots rising without `booked` → payment broken.
- Refund-issued rate spike → reaper/race misconfigured.
- Reaper not run in >2 intervals → stuck holds.
- Per-phone hold count abnormal → abuse.
- Daily bookings/tenant counter log.

**Manual QA (physical phone, Razorpay test mode):**
1. "Hi" → menu.
2. Book → Tomorrow → tap slot → Confirm → pay test ₹1 → confirmation arrives + owner notified.
3. Re-list date → booked slot gone.
4. Start booking, abandon at pay → after expiry+grace, slot reappears free.
5. Two phones race same slot → one confirmed, one rejected.
6. Pay after expiry simulation → refund + apology, not lost.
7. `CANCEL <id>` ≥4h → freed + refund flagged; <4h → refused.

---

## 7. Verification plan

| Criterion | Proof |
|---|---|
| Webhook verify/ack | unit on `GET/POST /webhook` |
| Inbound parsing | unit: text + button_reply + list_reply |
| Message dedupe | unit: replay `message.id` → skip |
| Tenant routing/isolation | unit: phoneId→tenant; A cannot read B |
| Slot lock no double-book | concurrency test (direct conn) |
| Hold-spam cap | unit: 2nd active hold rejected |
| Pay-vs-reaper refund | unit: capture on freed slot → refund path |
| Razorpay idempotency | unit: replay captured → single booking |
| Signature verify (both) | unit: bad signature → 400 |
| Cancellation | unit: ≥4h frees+refunds; <4h refused; foreign id rejected |
| Reaper | unit: expired+grace → free |
| Message builders | unit: snapshot Cloud API JSON |
| End-to-end | manual QA (§6) test mode |
| Lint/static | `npm run lint` |

---

## 8. ADR

**Decision:** Multi-tenant Node/Express bot on Meta Cloud API direct + Supabase + Razorpay, single Railway deployment, slot integrity via Postgres row locks on a **direct (non-pooled) connection**, payment reconciled at capture with auto-refund fallback.

**Drivers:** (1) zero platform cost (dev skips BSP markup ₹1,500/mo/client → near-100% platform margin); (2) double-booking + paid-but-no-slot prevention is the trust-critical requirement; (3) one cheap deployment serves many turfs.

**Alternatives considered:**
- *BSP (AiSensy/Wati)* — rejected: ₹1,500+/mo/client kills margin; weak slot-lock control.
- *Unofficial libs (Baileys etc.)* — rejected: ToS violation → ban risk on a paid product.
- *Render free* — rejected: sleeps → webhook misses bookings.
- *Per-client deployment* — rejected: 4× cost/ops, no benefit.
- *Pooled connection for lock txn* — rejected: pgBouncer txn-mode voids `FOR UPDATE` → double-booking.

**Steelman against chosen:** A BSP removes Meta verification, webhook hosting, uptime, template approval — real solo-dev burden; if dev time is scarce, ₹1,500/mo may beat the hours. **Rebuttal:** user is a dev wanting the free path; slot-locking control is the core differentiator; infra is one-time + cheap monitoring. Stands — uptime discipline non-negotiable (§6).

**Consequences:** User owns Meta verification, uptime, template approvals. Best margin + full control. Schema stores per-tenant token → Model 2 (embedded signup) is additive later.

**Follow-ups:** owner dashboard, refund-policy tiers, reminders cron polish, multi-sport, embedded signup, reporting.

---

## 9. Open questions (deferred to user)

1. **Ownership model v1:** Model 1 (you operate all numbers — recommended) vs Model 2 (clients own WABA). *Default Model 1, schema supports both.* Confirm?
2. **Razorpay routing:** per-tenant keys (money → owner direct, but owner needs **Razorpay KYC** — possible onboarding blocker) vs one shared account (you settle owners, you take cut, simpler onboarding). Which?
3. **Pricing to encode:** subscription-only vs subscription + per-booking fee (bot must count billable bookings)?
4. **Slot generation:** pre-generate daily rows (default) vs on-the-fly. OK?
5. **Cancellation refund v1:** auto-refund via Razorpay, or just free slot + manual refund by owner?
6. **Seed data:** real turf hours/prices, or dummy for v1?
