import { query } from "./db.js";

// Returns true if this message.id was already processed (and records it if new).
export async function alreadyProcessed(messageId) {
  if (!messageId) return false;
  const { rowCount } = await query(
    "insert into processed_messages (message_id) values ($1) on conflict do nothing",
    [messageId]
  );
  return rowCount === 0; // 0 = conflict = seen before
}
