import dotenv from "dotenv";
dotenv.config();

const num = (v, d) => (v === undefined ? d : Number(v));

export const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "change-me",
  APP_SECRET: process.env.APP_SECRET || "",
  PORT: num(process.env.PORT, 3000),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || "",
  HOLD_MINUTES: num(process.env.HOLD_MINUTES, 10),
  LINK_EXPIRY_MINUTES: num(process.env.LINK_EXPIRY_MINUTES, 20),
  REAPER_SECONDS: num(process.env.REAPER_SECONDS, 60),
  CANCEL_HOURS: num(process.env.CANCEL_HOURS, 4),
  STALE_MINUTES: num(process.env.STALE_MINUTES, 30),
  MAX_DAILY_HOLDS: num(process.env.MAX_DAILY_HOLDS, 10),
  TZ: process.env.TZ || "Asia/Kolkata",
  GRAPH_VERSION: "v21.0",
};

if (!CONFIG.DATABASE_URL) {
  console.warn("[config] DATABASE_URL not set — DB calls will fail.");
}
