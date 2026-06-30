import { getState, setState } from "./state.js";
import { send } from "./wa/send.js";
import * as M from "./wa/messages.js";
import { listFree, getSlot, holdSlot, freeSlot } from "./slots.js";
import { createBooking, setBookingLink, getUpcoming } from "./bookings.js";
import { createPaymentLink } from "./payments.js";
import { handleCancel } from "./cancel.js";
import { istToday, istDatePlus } from "./util.js";
import { CONFIG } from "./config.js";
import { log } from "./logger.js";

export async function handleInbound(tenant, inbound) {
  const from = inbound.from;

  // CANCEL works from any state.
  if (inbound.text && /^cancel\b/i.test(inbound.text)) {
    return handleCancel(tenant, from, inbound.text);
  }

  const conv = await getState(tenant.id, from);
  let { state, context: ctx } = conv;

  // Only treat plain TEXT as a greeting. Button/list taps carry their title in
  // `text` (e.g. "Book a Slot") which would otherwise match and loop the menu.
  const greet =
    inbound.type === "text" && /^(hi|hello|hey|menu|start)\b/i.test((inbound.text || "").trim());
  if (state === "START" || greet) {
    await send(tenant, M.buildMenu(from));
    return setState(tenant.id, from, "MENU", {});
  }

  switch (state) {
    case "MENU":
      if (inbound.value === "BOOK") {
        await send(tenant, M.buildDateButtons(from));
        return setState(tenant.id, from, "PICK_DATE", {});
      }
      if (inbound.value === "MYBOOKINGS") {
        const b = await getUpcoming(tenant.id, from);
        return send(tenant, M.buildMyBookings(from, b));
      }
      if (inbound.value === "PRICES") return send(tenant, M.buildPrices(from, tenant));
      return send(tenant, M.buildMenu(from));

    case "PICK_DATE": {
      let date;
      if (inbound.value === "DATE_TODAY") date = istToday();
      else if (inbound.value === "DATE_TOMORROW") date = istDatePlus(1);
      else if (inbound.value === "DATE_MORE") return send(tenant, M.buildDateList(from));
      else if (inbound.value?.startsWith("date_")) date = inbound.value.slice(5);
      else return send(tenant, M.buildDateButtons(from));

      const slots = await listFree(tenant.id, date);
      if (!slots.length) {
        await send(tenant, M.buildText(from, `No free slots on ${date}. Pick another day.`));
        return send(tenant, M.buildDateButtons(from));
      }
      await send(tenant, M.buildSlotList(from, slots, date));
      return setState(tenant.id, from, "PICK_SLOT", { date });
    }

    case "PICK_SLOT": {
      if (!inbound.value?.startsWith("slot_")) {
        const slots = await listFree(tenant.id, ctx.date);
        return send(tenant, M.buildSlotList(from, slots, ctx.date));
      }
      const slotId = Number(inbound.value.slice(5));
      const r = await holdSlot(tenant, slotId, from);
      if (!r.ok) {
        const msg =
          r.reason === "taken"
            ? "That slot was just taken. Pick another:"
            : r.reason === "active_hold"
            ? "You already have a slot on hold. Finish paying or wait for it to expire."
            : r.reason === "daily_limit"
            ? "Daily booking attempt limit reached. Try again tomorrow."
            : "Could not hold that slot. Pick another:";
        await send(tenant, M.buildText(from, msg));
        const slots = await listFree(tenant.id, ctx.date);
        if (slots.length) await send(tenant, M.buildSlotList(from, slots, ctx.date));
        return;
      }
      await send(tenant, M.buildConfirm(from, r.slot));
      return setState(tenant.id, from, "CONFIRM", { ...ctx, held_slot_id: slotId });
    }

    case "CONFIRM":
      if (inbound.value === "REPICK") {
        if (ctx.held_slot_id) await freeSlot(ctx.held_slot_id);
        await send(tenant, M.buildDateButtons(from));
        return setState(tenant.id, from, "PICK_DATE", {});
      }
      if (inbound.value === "PAY") {
        if (!ctx.name) {
          await send(tenant, M.buildText(from, "Your name for the booking?"));
          return setState(tenant.id, from, "ASK_NAME", ctx);
        }
        return startPayment(tenant, from, ctx);
      }
      return send(tenant, M.buildText(from, "Tap *Confirm & Pay* or *Pick another*."));

    case "ASK_NAME": {
      const name = (inbound.text || "").trim().slice(0, 60);
      if (!name) return send(tenant, M.buildText(from, "Please type your name."));
      return startPayment(tenant, from, { ...ctx, name });
    }

    case "PAYMENT":
      return send(
        tenant,
        M.buildText(from, "Payment pending — use the link sent, or type *CANCEL* to abort.")
      );

    default:
      await send(tenant, M.buildMenu(from));
      return setState(tenant.id, from, "MENU", {});
  }
}

async function startPayment(tenant, from, ctx) {
  const slot = await getSlot(ctx.held_slot_id);
  if (!slot || slot.status !== "held" || slot.held_by !== from) {
    await send(tenant, M.buildText(from, "Your hold expired. Let's start again."));
    await send(tenant, M.buildMenu(from));
    return setState(tenant.id, from, "MENU", {});
  }
  const booking = await createBooking(tenant.id, slot, from, ctx.name);
  try {
    const link = await createPaymentLink(tenant, booking, slot);
    await setBookingLink(booking.id, link.id);
    await send(tenant, M.buildPayText(from, link.url, CONFIG.LINK_EXPIRY_MINUTES));
    return setState(tenant.id, from, "PAYMENT", { ...ctx, booking_id: booking.id });
  } catch (e) {
    log.error("payment_link_failed", { tenant_id: tenant.id, phone: from, err: String(e) });
    await freeSlot(slot.id);
    await send(tenant, M.buildText(from, "Payment is temporarily unavailable. Please try again later."));
    return setState(tenant.id, from, "MENU", {});
  }
}
