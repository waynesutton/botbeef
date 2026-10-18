// AI spend tracking + the once-a-month $2,000 alert. Nothing here ever stops a game (no hard shutdown).
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ALERT_USD } from "./config";
import { dayKey, monthKey } from "./lib";

// Write-conflict rule: the per-AI-call write is a blind insert (no reads), so concurrent AI calls never retry.
// A single-writer cron folds settled rows into the monthly total, the game's cost and the host's day spend.
export const record = internalMutation({
  args: { gameId: v.optional(v.id("games")), usd: v.number() },
  handler: async (ctx, a) => {
    await ctx.db.insert("spendLog", { t: Date.now(), usd: a.usd, ...(a.gameId ? { gameId: a.gameId } : {}) });
  },
});

const SETTLE_MS = 2_000; // only roll rows older than this, so the range read never overlaps a fresh insert
const IN_PLAY = new Set(["setup", "lobby", "countdown", "live", "closing"]);
const STALE_MS = 15 * 60_000; // a game stuck "in play" this long is rolled anyway
export const rollup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const logs = await ctx.db.query("spendLog").withIndex("by_t", (q) => q.lt("t", now - SETTLE_MS)).take(1000);
    if (!logs.length) return { rolled: 0, held: 0 };
    const groups = new Map<string, typeof logs>();
    for (const l of logs) { const k = l.gameId ?? ""; groups.set(k, [...(groups.get(k) ?? []), l]); }
    const months = new Map<string, { usd: number; calls: number }>();
    let rolled = 0, held = 0;
    for (const [k, ls] of groups) {
      if (k) {
        const g = await ctx.db.get(ls[0].gameId!);
        // Don't touch a game doc while it's being played (players' mutations read it); fold it in once it's over.
        if (g && IN_PLAY.has(g.status) && now - g.createdAt < STALE_MS) { held += ls.length; continue; }
        const usd = ls.reduce((s, l) => s + l.usd, 0);
        if (g) {
          await ctx.db.patch(g._id, { costUsd: g.costUsd + usd, aiCalls: g.aiCalls + ls.length });
          const s = await ctx.db.get(g.hostSessionId);
          if (s) await ctx.db.patch(s._id, { daySpend: (s.dayKey === dayKey(now) ? s.daySpend : 0) + usd });
        }
      }
      for (const l of ls) {
        const m = months.get(monthKey(l.t)) ?? { usd: 0, calls: 0 };
        m.usd += l.usd; m.calls += 1; months.set(monthKey(l.t), m);
        await ctx.db.delete(l._id);
        rolled++;
      }
    }
    for (const [month, m] of months) {
      const row = await ctx.db.query("spend").withIndex("by_month", (q) => q.eq("month", month).eq("shard", 0)).unique();
      if (row) await ctx.db.patch(row._id, { usd: row.usd + m.usd, calls: row.calls + m.calls });
      else await ctx.db.insert("spend", { month, shard: 0, usd: m.usd, calls: m.calls });
    }
    if (logs.length === 1000 && rolled > 0) await ctx.scheduler.runAfter(0, internal.spend.rollup, {});
    return { rolled, held };
  },
});

export const summary = internalQuery({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const month = a.month ?? monthKey(Date.now());
    const rows = await ctx.db.query("spend").withIndex("by_month", (q) => q.eq("month", month)).collect();
    const sent = await ctx.db.query("alertsSent").withIndex("by_month", (q) => q.eq("month", month).eq("threshold", ALERT_USD)).first();
    return { month, usd: rows.reduce((s, r) => s + r.usd, 0), calls: rows.reduce((s, r) => s + r.calls, 0), alertSent: !!sent?.ok };
  },
});
export const markSent = internalMutation({
  args: { month: v.string(), ok: v.boolean(), detail: v.string() },
  handler: async (ctx, a) => {
    const prev = await ctx.db.query("alertsSent").withIndex("by_month", (q) => q.eq("month", a.month).eq("threshold", ALERT_USD)).first();
    if (prev) await ctx.db.patch(prev._id, { ok: a.ok, detail: a.detail, sentAt: Date.now() });
    else await ctx.db.insert("alertsSent", { month: a.month, threshold: ALERT_USD, ok: a.ok, detail: a.detail, sentAt: Date.now() });
  },
});

// Cron (every 15 min). Fires once per month when month-to-date AI spend first crosses $2,000.
export const check = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, a): Promise<{ month: string; usd: number; calls: number; alertSent: boolean; sent: boolean }> => {
    const s: { month: string; usd: number; calls: number; alertSent: boolean } = await ctx.runQuery(internal.spend.summary, {});
    if (s.alertSent || (!a.force && s.usd < ALERT_USD)) return { ...s, sent: false };
    const url = process.env.GROKBOT_ALERT_WEBHOOK_URL;
    const text = `${a.force ? "[TEST] " : ""}Bot Battle AI spend passed $${ALERT_USD.toLocaleString("en-US")} this month ($${s.usd.toFixed(2)} so far, ${s.calls} AI calls). Nothing was stopped.`;
    // sec-check #6: fail loudly (the cron run shows as failed in the dashboard and logs) instead of a quiet warning.
    if (!url) { console.error("GROKBOT_ALERT_WEBHOOK_URL not set; alert not delivered:", text); throw new Error("GROKBOT_ALERT_WEBHOOK_URL is not set: the AI spend alert could not be delivered."); }
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, message: text, app: "bot-battle", month: s.month, usd: s.usd }) });
    if (!a.force) await ctx.runMutation(internal.spend.markSent, { month: s.month, ok: r.ok, detail: `HTTP ${r.status}` });
    return { ...s, sent: r.ok };
  },
});
