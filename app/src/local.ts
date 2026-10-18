// Anonymous, browser-tied identity: a random secret in localStorage (stored hashed on the server).
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* embeds/private mode */ } };
export function secret() {
  let s = get("bb.secret");
  if (!s) {
    const b = crypto.getRandomValues(new Uint8Array(32));
    s = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    set("bb.secret", s);
  }
  return s;
}
export const store = {
  name: () => get("bb.name") ?? "",
  setName: (v: string) => set("bb.name", v),
  char: () => get("bb.char") ?? "grokbot",
  setChar: (v: string) => set("bb.char", v),
  mode: () => get("bb.mode") ?? "solo",
  setMode: (v: string) => set("bb.mode", v),
  seat: (slug: string) => get(`bb.seat.${slug}`) ?? undefined,
  setSeat: (slug: string, seat: string) => set(`bb.seat.${slug}`, seat),
  invite: (slug: string) => get(`bb.inv.${slug}`) ?? undefined,
  setInvite: (slug: string, t: string) => set(`bb.inv.${slug}`, t),
  /** Random per-browser viewer id for presence; unrelated to the secret. */
  viewer: () => { let v = get("bb.viewer"); if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); set("bb.viewer", v); } return v; },
  len: () => Number(get("bb.len")) || 30_000,
  setLen: (ms: number) => set("bb.len", String(ms)),
  pele: () => get("bb.pele") !== "0", // on by default for new visitors; an explicit "off" is kept
  setPele: (on: boolean) => set("bb.pele", on ? "1" : "0"),
  theme: () => get("bb.theme"),
  setTheme: (v: string) => set("bb.theme", v),
};

import { ConvexError } from "convex/values";
// User-facing message for a failed mutation (ConvexError data, or the rate limiter's RateLimited payload).
export function errMsg(e: unknown) {
  if (e instanceof ConvexError) {
    const d = e.data as string | { kind?: string; retryAfter?: number };
    if (typeof d === "string") return d;
    if (d?.kind === "RateLimited") return `Whoa, slow down! Try again in ${Math.ceil((d.retryAfter ?? 1000) / 1000)}s.`;
  }
  return "Something went wrong. Try again.";
}
