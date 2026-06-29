import express from "express";
import { CONFIG } from "./config.js";
import { metaVerify, metaWebhook } from "./webhook.js";
import { razorpayWebhook } from "./razorpayWebhook.js";
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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/webhook", metaVerify);
app.post("/webhook", metaWebhook);

app.post("/razorpay/webhook/:tenantId", razorpayWebhook);

app.listen(CONFIG.PORT, () => {
  log.info("server_up", { port: CONFIG.PORT });
  startReaper();
});
