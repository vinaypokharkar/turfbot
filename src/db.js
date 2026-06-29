import pg from "pg";
import { CONFIG } from "./config.js";

const { Pool } = pg;

// Pooled pool (pgBouncer / 6543) — general queries.
export const pooled = new Pool({ connectionString: CONFIG.DATABASE_URL });

// Direct pool (5432) — REQUIRED for SELECT ... FOR UPDATE. pgBouncer transaction
// mode can route a transaction's statements to different backends, voiding row
// locks → double-booking. Lock transactions MUST use this pool.
export const direct = new Pool({ connectionString: CONFIG.DIRECT_URL });

// Pin session timezone to IST on every new connection.
for (const p of [pooled, direct]) {
  p.on("connect", (client) => {
    client.query(`set time zone '${CONFIG.TZ}'`).catch(() => {});
  });
}

export function query(text, params) {
  return pooled.query(text, params);
}

// Run fn inside a transaction on the DIRECT (non-pooled) connection.
export async function withDirectTxn(fn) {
  const client = await direct.connect();
  try {
    await client.query("begin");
    const r = await fn(client);
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function close() {
  await Promise.allSettled([pooled.end(), direct.end()]);
}
