import { query } from "./db.js";
import { CONFIG } from "./config.js";
import { log } from "./logger.js";

// Periodically free held slots whose hold has expired.
export function startReaper() {
  const tick = async () => {
    try {
      const { rowCount } = await query(
        `update slots set status='free', held_by=null, hold_expires=null, booking_id=null
          where status='held' and hold_expires < now()`
      );
      if (rowCount) log.info("reaper_freed", { count: rowCount });
    } catch (e) {
      log.error("reaper_error", { err: String(e) });
    }
  };
  tick();
  return setInterval(tick, CONFIG.REAPER_SECONDS * 1000);
}
