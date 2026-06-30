import express from "express";
import { checkPassword, setSession, clearSession, requireAuth } from "./auth.js";
import * as V from "./views.js";
import { listAll, getById, createTenant, updateTenant } from "../tenants.js";
import { listByTenant } from "../bookings.js";
import { statusSummary, freeHeldByTenant } from "../slots.js";
import { query } from "../db.js";
import { log } from "../logger.js";

export const adminRouter = express.Router();
adminRouter.use(requireAuth);

// ---- auth ----
adminRouter.get("/login", (_req, res) => res.send(V.loginPage()));
adminRouter.post("/login", (req, res) => {
  if (checkPassword(req.body?.password)) {
    setSession(res);
    return res.redirect("/admin");
  }
  res.status(401).send(V.loginPage("Wrong password"));
});
adminRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.redirect("/admin/login");
});

// ---- dashboard ----
adminRouter.get("/", async (_req, res) => {
  res.send(V.dashboardPage(await listAll()));
});

// ---- create tenant ----
adminRouter.get("/tenants/new", (_req, res) => res.send(V.tenantFormPage(null)));
adminRouter.post("/tenants", async (req, res) => {
  try {
    const t = await createTenant(normalize(req.body));
    res.redirect(`/admin/tenants/${t.id}`);
  } catch (e) {
    log.error("admin_create_failed", { err: String(e) });
    res.status(400).send(V.loginPage("Create failed: " + e.message));
  }
});

// ---- view / edit tenant ----
adminRouter.get("/tenants/:id", async (req, res) => {
  const t = await getById(req.params.id);
  if (!t) return res.redirect("/admin");
  const [bookings, summary] = await Promise.all([
    listByTenant(t.id),
    statusSummary(t.id),
  ]);
  res.send(V.tenantDetailPage(t, bookings, summary));
});
adminRouter.get("/tenants/:id/edit", async (req, res) => {
  const t = await getById(req.params.id);
  if (!t) return res.redirect("/admin");
  res.send(V.tenantFormPage(t));
});
adminRouter.post("/tenants/:id", async (req, res) => {
  try {
    await updateTenant(req.params.id, normalize(req.body));
    res.redirect(`/admin/tenants/${req.params.id}`);
  } catch (e) {
    log.error("admin_update_failed", { err: String(e) });
    res.status(400).send(V.loginPage("Update failed: " + e.message));
  }
});

// ---- slot actions ----
adminRouter.post("/tenants/:id/generate-slots", async (req, res) => {
  const days = Math.max(1, Math.min(60, Number(req.body?.days) || 7));
  await query(
    `insert into slots (tenant_id, slot_date, start_time, end_time, price_paise)
     select t.id, d::date,
            (t.open_time + (h || ' hours')::interval)::time,
            (t.open_time + ((h+1) || ' hours')::interval)::time, t.price_paise
       from tenants t
       cross join generate_series(current_date, current_date + ($2::int - 1), interval '1 day') d
       cross join generate_series(0, (extract(hour from t.close_time)-extract(hour from t.open_time))::int - 1) h
      where t.id = $1::uuid
     on conflict (tenant_id, slot_date, start_time) do nothing`,
    [req.params.id, days]
  );
  res.redirect(`/admin/tenants/${req.params.id}`);
});
adminRouter.post("/tenants/:id/free-held", async (req, res) => {
  await freeHeldByTenant(req.params.id);
  res.redirect(`/admin/tenants/${req.params.id}`);
});

// ---- cancel a booking (admin) ----
adminRouter.post("/bookings/:id/cancel", async (req, res) => {
  const { rows } = await query("select * from bookings where id=$1", [req.params.id]);
  const b = rows[0];
  if (b) {
    const t = await getById(b.tenant_id);
    // reuse player cancel path (frees slot + refunds + notifies); bypass the 4h gate for admin
    await adminCancel(t, b);
  }
  res.redirect("back");
});

async function adminCancel(tenant, booking) {
  const { rows } = await query("select * from slots where id=$1", [booking.slot_id]);
  await query(
    "update slots set status='free', held_by=null, hold_expires=null, booking_id=null where id=$1",
    [booking.slot_id]
  );
  await query("update bookings set status='cancelled', updated_at=now() where id=$1", [booking.id]);
  log.info("admin_cancel", { tenant_id: tenant.id, booking_id: booking.id });
}

function normalize(body) {
  const out = { ...body };
  out.razorpay_test = body.razorpay_test === "true" || body.razorpay_test === true;
  for (const k of ["slot_minutes", "price_paise"]) if (out[k] != null) out[k] = Number(out[k]);
  for (const k of Object.keys(out)) if (out[k] === "") out[k] = null;
  return out;
}
