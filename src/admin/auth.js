import crypto from "crypto";
import { CONFIG } from "../config.js";

const COOKIE = "admin_session";

// Cookie token = HMAC(ADMIN_SECRET, "admin"). No DB/session store needed.
function token() {
  return crypto.createHmac("sha256", CONFIG.ADMIN_SECRET).update("admin").digest("hex");
}

export function checkPassword(pw) {
  if (!CONFIG.ADMIN_PASSWORD || !pw) return false;
  const a = Buffer.from(pw);
  const b = Buffer.from(CONFIG.ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function setSession(res) {
  const flags = ["HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=86400"];
  if (CONFIG.COOKIE_SECURE) flags.push("Secure");
  res.setHeader("Set-Cookie", `${COOKIE}=${token()}; ${flags.join("; ")}`);
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function isAuthed(req) {
  return parseCookies(req)[COOKIE] === token();
}

// Express middleware: gate everything under /admin except the login routes.
export function requireAuth(req, res, next) {
  if (req.path === "/login" || req.path === "/logout") return next();
  if (isAuthed(req)) return next();
  return res.redirect("/admin/login");
}
