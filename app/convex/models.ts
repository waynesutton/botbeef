// sec-check: public (models.board returns aggregate per-model stats only: no keys, prompts, player text or ids)
// Model scoreboard: per-call AI Gateway logging (aiCalls, modelGames: blind inserts) -> single-writer rollup cron
// (modelDaily) -> one cheap public query. Raw rows are kept RAW_KEEP_DAYS, then deleted by the cleanup cron.
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { CHARACTERS, JEV_MODEL, MODEL_OPTIONS, VERDICT_MODEL } from "./config";
import { dayKey } from "./lib";
import { modelsBoard } from "./returns";

export const RAW_KEEP_DAYS = 7;
const SETTLE_MS = 2_000; // only roll rows older than this (same rule as spend.rollup)
const BATCH = 500;
const ROLE: Record<string, string> = { answer: "bot", refresh: "bot", score: "judge", setup: "judge", moderation: "judge", verdict: "announcer" };
const roleOf = (purpose: string) => ROLE[purpose] ?? "other";

type Acc = Omit<Doc<"modelDaily">, "_id" | "_creationTime">;
const FIELDS = ["calls", "errors", "msSum", "ttftSum", "ttftN", "tin", "tout", "usd", "games", "wins", "losses", "draws", "scoreSum"] as const;
const zero = (day: string, model: string, role: string): Acc => ({ day, model, role, calls: 0, errors: 0, msSum: 0, ttftSum: 0, ttftN: 0, tin: 0, tout: 0, usd: 0, lgames: 0, games: 0, wins: 0, losses: 0, draws: 0, scoreSum: 0 });

// Cron (every minute). The only writer of modelDaily, so its docs never conflict.
export const rollup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cut = Date.now() - SETTLE_MS;
    const calls = await ctx.db.query("aiCalls").withIndex("by_rolled", (q) => q.eq("rolled", false).lt("t", cut)).take(BATCH);
    const games = await ctx.db.query("modelGames").withIndex("by_rolled", (q) => q.eq("rolled", false).lt("t", cut)).take(BATCH);
    if (!calls.length && !games.length) return { calls: 0, games: 0 };
    const acc = new Map<string, Acc>();
    const get = (day: string, model: string, role: string) => { const k = `${day}|${model}|${role}`; let a = acc.get(k); if (!a) acc.set(k, (a = zero(day, model, role))); return a; };
    for (const c of calls) {
      const a = get(dayKey(c.t), c.model, roleOf(c.purpose));
      a.calls++; if (!c.ok) a.errors++; else a.msSum += c.ms;
      if (c.ttft !== undefined) { a.ttftSum += c.ttft; a.ttftN++; }
      a.tin += c.tin ?? 0; a.tout += c.tout ?? 0; a.usd += c.usd;
      await ctx.db.patch(c._id, { rolled: true });
    }
    for (const g of games) {
      const a = get(dayKey(g.t), g.model, "bot");
      a.games++; a.scoreSum += g.score; if (g.logged) a.lgames = (a.lgames ?? 0) + 1; // games whose calls were logged (cost per game)
      if (g.outcome === "w") a.wins++; else if (g.outcome === "l") a.losses++; else a.draws++;
      await ctx.db.patch(g._id, { rolled: true });
    }
    for (const a of acc.values()) {
      const row = await ctx.db.query("modelDaily").withIndex("by_day", (q) => q.eq("day", a.day).eq("model", a.model).eq("role", a.role)).unique();
      if (!row) { await ctx.db.insert("modelDaily", a); continue; }
      const n = { ...row };
      for (const k of FIELDS) n[k] = row[k] + a[k];
      n.lgames = (row.lgames ?? 0) + (a.lgames ?? 0);
      const { _id, _creationTime, ...rest } = n; void _creationTime;
      await ctx.db.patch(_id, rest);
    }
    if (calls.length === BATCH || games.length === BATCH) await ctx.scheduler.runAfter(0, internal.models.rollup, {});
    return { calls: calls.length, games: games.length };
  },
});

// Cron (hourly). Raw rows only live RAW_KEEP_DAYS; only rolled rows are deleted.
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = Date.now() - RAW_KEEP_DAYS * 86_400_000;
    let n = 0;
    for (const table of ["aiCalls", "modelGames"] as const) {
      const rows = await ctx.db.query(table).withIndex("by_t", (q) => q.lt("t", old)).take(500);
      for (const r of rows) if (r.rolled) { await ctx.db.delete(r._id); n++; }
      if (rows.length === 500) await ctx.scheduler.runAfter(1000, internal.models.cleanup, {});
    }
    return { deleted: n };
  },
});

/** One-off after adding lgames: count logged games (finished at or after `since`) still in the raw rows into modelDaily. */
export const fixLoggedGames = internalMutation({
  args: { since: v.number() },
  handler: async (ctx, a) => {
    const rows = await ctx.db.query("modelGames").withIndex("by_t", (q) => q.gte("t", a.since)).take(4000);
    const n = new Map<string, number>();
    for (const g of rows) {
      if (!g.logged) await ctx.db.patch(g._id, { logged: true });
      if (g.rolled) { const k = `${dayKey(g.t)}|${g.model}`; n.set(k, (n.get(k) ?? 0) + 1); }
    }
    for (const [k, c] of n) {
      const [day, model] = k.split("|");
      const row = await ctx.db.query("modelDaily").withIndex("by_day", (q) => q.eq("day", day).eq("model", model).eq("role", "bot")).unique();
      if (row) await ctx.db.patch(row._id, { lgames: c });
    }
    return { games: rows.length, cells: n.size };
  },
});

/** One-off: seed modelGames from games finished before per-call logging existed (outcomes and scores only; no latency). */
export const backfillGames = internalMutation({
  args: { before: v.number(), cursor: v.optional(v.union(v.string(), v.null())) }, // before = deploy time of models logging, so no game counts twice
  handler: async (ctx, a) => {
    const page = await ctx.db.query("results").withIndex("by_finished", (q) => q.lt("finishedAt", a.before)).paginate({ cursor: a.cursor ?? null, numItems: 100 });
    let n = 0;
    for (const r of page.page) {
      const answers = await ctx.db.query("answers").withIndex("by_game", (q) => q.eq("gameId", r.gameId)).collect();
      for (let i = 0; i < 2; i++) {
        const c = r.corners[i], an = answers.find((x) => x.corner === i);
        if (c.kind !== "agent" || !c.characterId || !an) continue;
        const outcome = r.winner === "draw" ? "d" : r.winner === i ? "w" : "l";
        await ctx.db.insert("modelGames", { t: r.finishedAt, model: an.model, bot: c.characterId, score: r.scores[i], outcome, vsHuman: r.corners[1 - i].kind === "human", rolled: false });
        n++;
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.models.backfillGames, { before: a.before, cursor: page.continueCursor });
    return { inserted: n, done: page.isDone };
  },
});

// ---------- public scoreboard ----------
const OPTS = Object.entries(MODEL_OPTIONS).flatMap(([bot, os]) => os.map((o, i) => ({ bot, ...o, isDefault: i === 0 })));
const clean = (m: string) => m.replace(/^~/, "");
const labelOf = (m: string) => OPTS.find((o) => o.model === m)?.label ?? (m === JEV_MODEL ? "Jev 1.13" : clean(m).split("/").pop()!);
// Rank by a shrunk win rate (5 phantom 50% games) so 3-0 doesn't outrank 40-10; the card shows the raw rate.
const rankScore = (m: { games: number; wins: number; draws: number }) => (m.games ? (m.wins + 0.5 * m.draws + 2.5) / (m.games + 5) : -1);
const r1 = (x: number) => Math.round(x * 10) / 10;

export const board = query({
  args: { days: v.optional(v.union(v.literal(7), v.literal(30))) },
  returns: modelsBoard,
  handler: async (ctx, a) => {
    const days = a.days ?? 30;
    const from = dayKey(Date.now() - (days - 1) * 86_400_000);
    const rows = await ctx.db.query("modelDaily").withIndex("by_day", (q) => q.gte("day", from)).take(5000);
    const sum = new Map<string, Acc>();
    for (const r of rows) {
      const k = `${r.model}|${r.role}`;
      const s = sum.get(k) ?? zero(from, r.model, r.role);
      for (const f of FIELDS) s[f] += r[f];
      s.lgames = (s.lgames ?? 0) + (r.lgames ?? 0);
      sum.set(k, s);
    }
    const bots = (m: string) => [...new Set(OPTS.filter((o) => o.model === m).map((o) => o.bot))]
      .map((id) => CHARACTERS.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c && !c.retired).map((c) => ({ id: c.id, name: c.name }));
    const stat = (s: Acc | undefined) => {
      const ok = s ? s.calls - s.errors : 0;
      return {
        calls: s?.calls ?? 0,
        avgMs: s && ok ? Math.round(s.msSum / ok) : null,
        ttftMs: s && s.ttftN ? Math.round(s.ttftSum / s.ttftN) : null,
        errorRate: s && s.calls ? r1((100 * s.errors) / s.calls) : null,
      };
    };
    const models = [...new Set(OPTS.map((o) => o.model))].map((m) => {
      const s = sum.get(`${m}|bot`);
      const games = s?.games ?? 0;
      const o = OPTS.find((x) => x.model === m)!;
      return {
        model: clean(m), label: o.label, provider: clean(m).split("/")[0], speed: o.speed, isDefault: OPTS.some((x) => x.model === m && x.isDefault), bots: bots(m),
        games, wins: s?.wins ?? 0, losses: s?.losses ?? 0, draws: s?.draws ?? 0,
        winPct: games ? Math.round((100 * (s!.wins + 0.5 * s!.draws)) / games) : null,
        avgScore: games ? Math.round(s!.scoreSum / games) : null,
        costPerGame: s?.lgames && s.usd ? s.usd / s.lgames : null, // only games played since per-call logging began
        ...stat(s),
      };
    }).filter((m) => m.bots.length > 0)
      .sort((x, y) => rankScore(y) - rankScore(x) || y.games - x.games || x.label.localeCompare(y.label));
    const crew = ([[JEV_MODEL, "judge", "Jev scoring"], [VERDICT_MODEL, "announcer", "Verdict announcer"]] as const).map(([m, role, what]) => ({
      model: clean(m), label: labelOf(m), role, what, ...stat(sum.get(`${m}|${role}`)),
    }));
    const tot = [...sum.values()];
    return {
      days, from,
      totals: { calls: tot.reduce((n, s) => n + s.calls, 0), games: tot.filter((s) => s.role === "bot").reduce((n, s) => n + s.games, 0), models: models.filter((m) => m.games || m.calls).length },
      models, crew,
    };
  },
});
