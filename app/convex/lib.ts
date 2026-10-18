import { ConvexError } from "convex/values";
import { RateLimiter, MINUTE, SECOND, HOUR, DAY } from "@convex-dev/rate-limiter";
import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Deployment scheduled-job concurrency is 256 on the default class; keep the pools well under it.
export const livePool = new Workpool(components.livePool, { maxParallelism: 100 });
export const finalPool = new Workpool(components.finalPool, { maxParallelism: 50 });

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  startSession: { kind: "fixed window", rate: 6, period: 10 * MINUTE },
  // Global keys are one hot doc each: shard them so simultaneous starts / new sessions don't OCC-conflict.
  startGlobal: { kind: "token bucket", rate: 6000, period: HOUR, capacity: 300, shards: 30 },
  draft: { kind: "token bucket", rate: 6, period: SECOND, capacity: 12 },
  invite: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 10 },
  // Max new rotation questions a player can add per day (approved + new only; duplicates don't count).
  rotationInsert: { kind: "fixed window", rate: 3, period: DAY },
  // Paid-call gate keyed on something the client can't rotate (sec-check #1). Generous: one player is already capped
  // at 6 starts / 10 min per session, so this only bites when someone mints sessions to farm AI games.
  startIp: { kind: "token bucket", rate: 180, period: HOUR, capacity: 30 },
  // Host-only invite regeneration (sec-check #7).
  regenInvite: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 10 },
  newSession: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60, shards: 20 },
});

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export function slug(n = 10) {
  const b = crypto.getRandomValues(new Uint8Array(n * 2));
  let s = "";
  for (let i = 0; s.length < n && i < b.length; i++) if (b[i] < 248) s += B62[b[i] % 62];
  return s.padEnd(n, "x");
}
export function token() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}
export function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const ptParts = (t: number) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
};
export const dayKey = (t: number) => { const p = ptParts(t); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };
export const monthKey = (t: number) => dayKey(t).slice(0, 7);
// Week id = the PT date of that week's Monday (weeks reset Monday 00:00 PT).
export const weekKey = (t: number) => {
  const p = ptParts(t);
  const back = (p.wd + 6) % 7;
  const mon = new Date(Date.UTC(p.y, p.m - 1, p.d - back));
  return mon.toISOString().slice(0, 10);
};

const BLOCK = /(n[i1]gg|f[a@]gg|kike|retard|hitler|nazi|rapist|cunt|whore|admin|moderator|official|convex team|xai staff)/i;
export function cleanName(raw: string) {
  const n = raw.replace(/[^\p{L}\p{N} _.\-']/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (n.length < 3) throw new ConvexError("Name must be 3 to 20 characters.");
  if (BLOCK.test(n)) throw new ConvexError("Pick a different name.");
  return n;
}

export async function seatCorner(game: Doc<"games">, seat: string | undefined) {
  if (!seat) return -1;
  const h = await sha256(seat);
  return game.corners.findIndex((c) => c.seatHash !== undefined && safeEq(c.seatHash, h));
}
export async function gameBySlug(ctx: QueryCtx, s: string) {
  if (!/^[0-9A-Za-z]{10}$/.test(s)) return null;
  return await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", s)).unique();
}

/** sec-check #1: per-IP limit on everything that starts AI work (start, rematch, claimInvite). The IP comes from
 *  Convex request metadata, never from args. IPs in the BB_TRUSTED_IPS env (comma list, exact or `prefix*`; set only
 *  while the e2e/load suites run, then unset) skip it,
 *  and calls with no client IP (server-side runs) skip it too. */
export async function limitByIp(ctx: MutationCtx) {
  const { ip } = await ctx.meta.getRequestMetadata();
  if (!ip) return;
  const trusted = (process.env.BB_TRUSTED_IPS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (trusted.some((t) => (t.endsWith("*") ? ip.startsWith(t.slice(0, -1)) : ip === t))) return; // "1.2.3.*" = prefix
  const lim = await rateLimiter.limit(ctx, "startIp", { key: ip });
  if (!lim.ok) throw new ConvexError("Lots of battles from your network right now. Try again in a few minutes!");
}

/** sec-check #4: the one visibility rule for finished games, used by every read path (view, SSR page, recent, sitemap). */
export const isPublicResult = (r: { hidden: boolean }) => !r.hidden;
export async function isPublicGame(ctx: QueryCtx, g: Doc<"games">) {
  const r = await ctx.db.query("results").withIndex("by_game", (q) => q.eq("gameId", g._id)).first();
  return !r || isPublicResult(r);
}
