// Pure Cloud API payload builders. No I/O — unit-testable.
import { fmtDate, fmtTime, fmtMoney, istToday, istDatePlus } from "../util.js";

const base = (to) => ({ messaging_product: "whatsapp", to });

export function buildText(to, body) {
  return { ...base(to), type: "text", text: { body } };
}

function buttons(to, text, btns) {
  return {
    ...base(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: btns.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
      },
    },
  };
}

function list(to, header, body, buttonLabel, rows) {
  return {
    ...base(to),
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: header },
      body: { text: body },
      action: {
        button: buttonLabel,
        sections: [{ title: "Options", rows }],
      },
    },
  };
}

export function buildMenu(to) {
  return buttons(to, "🏟️ Welcome! What would you like to do?", [
    { id: "BOOK", title: "Book a Slot" },
    { id: "MYBOOKINGS", title: "My Bookings" },
    { id: "PRICES", title: "Prices & Info" },
  ]);
}

export function buildDateButtons(to) {
  return buttons(to, "📅 Which day?", [
    { id: "DATE_TODAY", title: "Today" },
    { id: "DATE_TOMORROW", title: "Tomorrow" },
    { id: "DATE_MORE", title: "More days" },
  ]);
}

export function buildDateList(to) {
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const iso = istDatePlus(i);
    rows.push({ id: `date_${iso}`, title: fmtDate(iso), description: i === 0 ? "Today" : "" });
  }
  return list(to, "📅 Pick a day", "Choose a date below.", "Pick a day", rows);
}

export function buildSlotList(to, slots, dateIso) {
  const rows = slots.slice(0, 10).map((s) => ({
    id: `slot_${s.id}`,
    title: `${fmtTime(s.start_time)} - ${fmtTime(s.end_time)}`,
    description: fmtMoney(s.price_paise),
  }));
  return list(to, `🕐 Slots — ${fmtDate(dateIso)}`, "Tap a free slot to book.", "Pick a slot", rows);
}

export function buildConfirm(to, slot) {
  const text =
    `✅ Hold *${fmtTime(slot.start_time)} - ${fmtTime(slot.end_time)}*, ${fmtDate(slot.slot_date)}\n` +
    `Amount: ${fmtMoney(slot.price_paise)}\nSlot held briefly. Confirm?`;
  return buttons(to, text, [
    { id: "PAY", title: "Confirm & Pay" },
    { id: "REPICK", title: "Pick another" },
  ]);
}

export function buildPayText(to, url, mins) {
  return buildText(
    to,
    `💳 Pay to lock your slot:\n${url}\n⏳ Pay within ${mins} min. Slot is released if unpaid.`
  );
}

export function buildConfirmation(to, tenant, slot) {
  const lines = [
    "🎉 Booking CONFIRMED!",
    `🏟️ ${tenant.turf_name}`,
    `📅 ${fmtDate(slot.slot_date)}, ${fmtTime(slot.start_time)} - ${fmtTime(slot.end_time)}`,
    `💰 ${fmtMoney(slot.price_paise)} paid`,
  ];
  if (tenant.address) lines.push(`📍 ${tenant.address}`);
  if (tenant.maps_url) lines.push(tenant.maps_url);
  lines.push(`Reply *CANCEL ${slot.booking_id}* to cancel (4h+ before).`);
  return buildText(to, lines.join("\n"));
}

export function buildOwnerNotify(to, slot, name, phone) {
  return buildText(
    to,
    `✅ New booking — ${fmtDate(slot.slot_date)}, ${fmtTime(slot.start_time)} - ${fmtTime(
      slot.end_time
    )}. Player: ${name || "?"} (${phone}). Paid & confirmed.`
  );
}

export function buildMyBookings(to, bookings) {
  if (!bookings.length) return buildText(to, "You have no upcoming bookings.");
  const lines = ["📋 Your upcoming bookings:"];
  for (const b of bookings) {
    lines.push(
      `#${b.id} — ${fmtDate(b.slot_date)}, ${fmtTime(b.start_time)} - ${fmtTime(b.end_time)}` +
        ` (CANCEL ${b.id})`
    );
  }
  return buildText(to, lines.join("\n"));
}

export function buildPrices(to, tenant) {
  return buildText(
    to,
    `🏟️ ${tenant.turf_name}\n📍 ${tenant.address || "-"}\n🕐 ${tenant.open_time}–${tenant.close_time}\n` +
      `💰 ${fmtMoney(tenant.price_paise)} / ${tenant.slot_minutes} min\nSend *Hi* to book.`
  );
}

export { istToday };
