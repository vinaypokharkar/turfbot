# WhatsApp Message Templates — submit to Meta on Day 1

Template approval has lead time and can be **rejected**. Submit these the moment
your WhatsApp Business Account exists, in parallel with development.

The booking **confirmation** is sent immediately after the user pays — they were
just chatting, so it falls inside the 24-hour customer-service window and is sent as
**free-form text** (no template needed). Templates below are needed for messages
that may land **outside** the 24h window: reminders and owner notifications.

Submit at: Meta Business Suite → WhatsApp Manager → Message Templates.

---

## 1. `booking_reminder` (category: UTILITY)
Variables: {{1}} turf name, {{2}} date, {{3}} time

```
⏰ Reminder: your slot at {{1}} is today — {{2}}, {{3}}. See you on the turf! 🏟️
```

## 2. `owner_new_booking` (category: UTILITY)
Variables: {{1}} date, {{2}} time, {{3}} player name, {{4}} player phone

```
✅ New booking — {{1}}, {{2}}. Player: {{3}} ({{4}}). Paid & confirmed.
```

## 3. `owner_cancellation` (category: UTILITY)
Variables: {{1}} date, {{2}} time, {{3}} player name

```
⚠️ Cancellation — {{1}}, {{2}} by {{3}}. Slot is now free again.
```

---

### Notes
- Keep variable order exactly as above — `src/wa/messages.js` builders depend on it.
- Until templates are approved, reminders/owner-notify will fail to send to users
  outside the 24h window. The booking flow (confirmation included) still works.
- After approval, wire reminder sends into a cron (follow-up, not in v1 reaper).
