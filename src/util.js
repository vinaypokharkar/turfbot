import { CONFIG } from "./config.js";

const TZ = CONFIG.TZ;

// yyyy-mm-dd for "today" in IST.
export function istToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// yyyy-mm-dd for today + n days (IST).
export function istDatePlus(n) {
  const base = new Date(istToday() + "T00:00:00+05:30");
  base.setDate(base.getDate() + n);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

// "Tue 30 Jun" from yyyy-mm-dd.
export function fmtDate(iso) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(iso + "T00:00:00+05:30"));
}

// "7:00 PM" from a pg time string "HH:MM:SS".
export function fmtTime(t) {
  const [h, m] = String(t).split(":");
  const hh = Number(h);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${m} ${ampm}`;
}

// "₹900" from paise.
export function fmtMoney(paise) {
  return "₹" + (Number(paise) / 100).toLocaleString("en-IN");
}
