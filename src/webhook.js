import { CONFIG } from "./config.js";
import { verifyMeta } from "./wa/verify.js";
import { getByPhoneId } from "./tenants.js";
import { parseInbound } from "./inbound.js";
import { alreadyProcessed } from "./dedupe.js";
import { handleInbound } from "./flow.js";
import { log } from "./logger.js";

// GET /webhook — Meta verification handshake.
export function metaVerify(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) return res.send(challenge);
  return res.sendStatus(403);
}

// POST /webhook — inbound messages.
export async function metaWebhook(req, res) {
  log.info("webhook_hit", { hasSig: !!req.headers["x-hub-signature-256"], hasSecret: !!CONFIG.APP_SECRET });
  if (!verifyMeta(req.rawBody, req.headers["x-hub-signature-256"], CONFIG.APP_SECRET)) {
    log.warn("meta_signature_fail");
    return res.sendStatus(401);
  }
  res.sendStatus(200); // ack fast (<5s) — Meta retries otherwise

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return; // status callbacks etc.

    const phoneId = value.metadata?.phone_number_id;
    const tenant = await getByPhoneId(phoneId);
    if (!tenant) {
      log.warn("unknown_phone_number_id", { phoneId });
      return;
    }
    if (await alreadyProcessed(message.id)) return;

    const inbound = parseInbound(value, message);
    await handleInbound(tenant, inbound);
  } catch (e) {
    log.error("webhook_process_error", { err: String(e) });
  }
}
