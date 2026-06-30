import express from "express";
import { CONFIG } from "./config.js";
import { metaVerify, metaWebhook } from "./webhook.js";
import { razorpayWebhook } from "./razorpayWebhook.js";
import { adminRouter } from "./admin/router.js";
import { startReaper } from "./reaper.js";
import { log } from "./logger.js";

const app = express();

// Capture raw body — required for Meta + Razorpay signature verification.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
// Admin dashboard forms post urlencoded bodies.
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/webhook", metaVerify);
app.post("/webhook", metaWebhook);

app.post("/razorpay/webhook/:tenantId", razorpayWebhook);

// Private admin dashboard (password-gated).
app.use("/admin", adminRouter);

app.listen(CONFIG.PORT, () => {
  log.info("server_up", { port: CONFIG.PORT });
  startReaper();
});
