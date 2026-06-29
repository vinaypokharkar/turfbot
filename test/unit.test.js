import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import { parseInbound } from "../src/inbound.js";
import { verifyMeta, verifyRazorpay } from "../src/wa/verify.js";
import { buildMenu, buildSlotList, buildText } from "../src/wa/messages.js";

test("parseInbound: plain text", () => {
  const value = { contacts: [{ profile: { name: "Rahul" } }] };
  const msg = { from: "9199", id: "wamid.1", type: "text", text: { body: "Hi" } };
  const r = parseInbound(value, msg);
  assert.equal(r.type, "text");
  assert.equal(r.text, "Hi");
  assert.equal(r.from, "9199");
  assert.equal(r.name, "Rahul");
});

test("parseInbound: button reply id", () => {
  const msg = {
    from: "9199",
    id: "wamid.2",
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id: "BOOK", title: "Book a Slot" } },
  };
  const r = parseInbound({}, msg);
  assert.equal(r.type, "button");
  assert.equal(r.value, "BOOK");
});

test("parseInbound: list reply id", () => {
  const msg = {
    from: "9199",
    id: "wamid.3",
    type: "interactive",
    interactive: { type: "list_reply", list_reply: { id: "slot_42", title: "7:00 PM - 8:00 PM" } },
  };
  const r = parseInbound({}, msg);
  assert.equal(r.type, "list");
  assert.equal(r.value, "slot_42");
});

test("verifyMeta: valid + invalid signatures", () => {
  const secret = "appsecret";
  const body = Buffer.from(JSON.stringify({ a: 1 }));
  const good = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyMeta(body, good, secret), true);
  assert.equal(verifyMeta(body, "sha256=deadbeef", secret), false);
  assert.equal(verifyMeta(body, undefined, secret), false);
});

test("verifyRazorpay: valid + invalid signatures", () => {
  const secret = "whsec";
  const body = Buffer.from(JSON.stringify({ event: "payment_link.paid" }));
  const good = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyRazorpay(body, good, secret), true);
  assert.equal(verifyRazorpay(body, "nope", secret), false);
});

test("buildMenu: valid interactive button payload", () => {
  const p = buildMenu("9199");
  assert.equal(p.type, "interactive");
  assert.equal(p.interactive.type, "button");
  assert.equal(p.interactive.action.buttons.length, 3);
  assert.equal(p.interactive.action.buttons[0].reply.id, "BOOK");
});

test("buildSlotList: rows carry slot ids", () => {
  const slots = [
    { id: 42, start_time: "19:00:00", end_time: "20:00:00", price_paise: 90000 },
  ];
  const p = buildSlotList("9199", slots, "2026-06-30");
  const row = p.interactive.action.sections[0].rows[0];
  assert.equal(row.id, "slot_42");
  assert.match(row.title, /7:00 PM - 8:00 PM/);
  assert.equal(row.description, "₹900");
});

test("buildText: shape", () => {
  const p = buildText("9199", "hello");
  assert.deepEqual(p, { messaging_product: "whatsapp", to: "9199", type: "text", text: { body: "hello" } });
});
