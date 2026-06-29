import { CONFIG } from "../config.js";
import { log } from "../logger.js";

// Send any Cloud API payload using the tenant's number + token.
export async function send(tenant, payload) {
  const url = `https://graph.facebook.com/${CONFIG.GRAPH_VERSION}/${tenant.phone_number_id}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenant.wa_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      log.error("wa_send_failed", { tenant_id: tenant.id, status: res.status, body });
    }
    return res.ok;
  } catch (e) {
    log.error("wa_send_error", { tenant_id: tenant.id, err: String(e) });
    return false;
  }
}
