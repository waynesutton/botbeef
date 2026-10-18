// Light self-learning, no model training. Each finished or abandoned game updates small counters; auto question picks and
// Jev's rival pick are then nudged toward what plays well (finished, close, rematched) with a fixed share of pure exploration.
import { v } from "convex/values";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { CHALLENGES } from "./config";
import { questionKey } from "./moderation";

export const EXPLORE = 0.2; // share of picks that ignore the stats entirely
const SHARPNESS = 4;        // how hard quality differences pull (weight = e^(4 * quality))
type QS = { games: number; completed: number; abandoned: number; rematches: number; closeSum: number };
const ZERO: QS = { games: 0, completed: 0, abandoned: 0, rematches: 0, closeSum: 0 };

/** 0..1. Priors (worth 2 games) keep a new question near average: 80% completion, 10% rematch, 0.6 closeness. */
export function quality(s: QS = ZERO) {
  const n = s.games;
  const comp = (s.completed + 1.6) / (n + 2);
  const rem = Math.min(1, ((s.rematches + 0.2) / (n + 2)) * 3);
  const close = (s.closeSum + 1.2) / (n + 2);
  return 0.45 * comp + 0.25 * rem + 0.3 * close;
}
/** Weighted pick with exploration. `q` maps an item to its quality (0..1). */
export function learnedPick<T>(items: T[], q: (t: T) => number, rnd = Math.random): T {
  if (items.length === 1 || rnd() < EXPLORE) return items[Math.floor(rnd() * items.length)];
  const w = items.map((t) => Math.exp(SHARPNESS * q(t)));
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((r -= w[i]) <= 0) return items[i];
  return items[items.length - 1];
}
/** Pick probabilities (for Jev's rival blend and for tests). */
export function learnedProbs(qs: number[]) {
  const w = qs.map((x) => Math.exp(SHARPNESS * x)); const t = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (1 - EXPLORE) * (x / t) + EXPLORE / qs.length);
}

export const qKey = (g: Pick<Doc<"games">, "question" | "questionSource" | "challengeId">) =>
  !g.question ? g.challengeId : g.questionSource === "rotation" ? `rot:${questionKey(g.question)}` : null;
const pairOf = (g: Doc<"games">) => {
  const ids = g.corners.map((c) => (c.kind === "agent" ? c.characterId : undefined));
  return ids[0] && ids[1] ? [...ids].sort().join("|") : null;
};
export async function statsMap(ctx: QueryCtx | MutationCtx) {
  return new Map((await ctx.db.query("questionStats").collect()).map((r) => [r.key, r as QS]));
}
async function bumpQ(ctx: MutationCtx, key: string, d: Partial<QS>) {
  const row = await ctx.db.query("questionStats").withIndex("by_key", (q) => q.eq("key", key)).unique();
  const base = row ?? { ...ZERO };
  const next = { games: base.games + (d.games ?? 0), completed: base.completed + (d.completed ?? 0), abandoned: base.abandoned + (d.abandoned ?? 0), rematches: base.rematches + (d.rematches ?? 0), closeSum: base.closeSum + (d.closeSum ?? 0) };
  if (row) await ctx.db.patch(row._id, next); else await ctx.db.insert("questionStats", { key, ...next });
}

/** Game finished with final scores. */
export async function onFinished(ctx: MutationCtx, g: Doc<"games">, finals: number[]) {
  const close = Math.max(0, 1 - Math.abs((finals[0] ?? 0) - (finals[1] ?? 0)) / 100);
  const k = qKey(g); if (k) await bumpQ(ctx, k, { games: 1, completed: 1, closeSum: close });
  const p = pairOf(g); if (!p) return;
  const row = await ctx.db.query("matchupStats").withIndex("by_pair", (q) => q.eq("pair", p)).unique();
  if (row) await ctx.db.patch(row._id, { games: row.games + 1, closeSum: row.closeSum + close });
  else await ctx.db.insert("matchupStats", { pair: p, games: 1, closeSum: close });
}
/** Ended early by the host, no contest, or a lobby that was never joined. */
export async function onAbandoned(ctx: MutationCtx, g: Doc<"games">) {
  const k = qKey(g); if (k) await bumpQ(ctx, k, { games: 1, abandoned: 1 });
}
/** Someone asked for a rematch of this game: a strong "this was fun" signal for its question. */
export async function onRematch(ctx: MutationCtx, g: Doc<"games">) {
  const k = qKey(g); if (k) await bumpQ(ctx, k, { rematches: 1 });
}

/** Auto question: a built-in challenge id, nudged by its stats. */
export async function pickChallengeId(ctx: MutationCtx) {
  const m = await statsMap(ctx);
  return learnedPick(CHALLENGES, (c) => quality(m.get(c.id))).id;
}
/** Matchup closeness for each candidate rival of `me` (prior 0.6 worth 2 games). */
export const rivalQuality = internalQuery({
  args: { me: v.string(), options: v.array(v.string()) },
  handler: async (ctx, a) => {
    const out: Record<string, number> = {};
    for (const o of a.options) {
      const row = await ctx.db.query("matchupStats").withIndex("by_pair", (q) => q.eq("pair", [a.me, o].sort().join("|"))).unique();
      out[o] = ((row?.closeSum ?? 0) + 1.2) / ((row?.games ?? 0) + 2);
    }
    return out;
  },
});

// ---------- for e2e / admin ----------
export const inspect = internalQuery({
  args: { key: v.optional(v.string()), pair: v.optional(v.string()) },
  handler: async (ctx, a) => ({
    q: a.key ? await ctx.db.query("questionStats").withIndex("by_key", (q) => q.eq("key", a.key!)).unique() : null,
    m: a.pair ? await ctx.db.query("matchupStats").withIndex("by_pair", (q) => q.eq("pair", a.pair!)).unique() : null,
  }),
});
/** Simulate picks over fake stats: returns pick counts so tests can see the nudge and the exploration. */
export const simulate = internalQuery({
  args: { stats: v.array(v.object({ games: v.number(), completed: v.number(), abandoned: v.number(), rematches: v.number(), closeSum: v.number() })), n: v.number() },
  handler: async (_ctx, a) => {
    const idx = a.stats.map((_, i) => i); const counts = idx.map(() => 0);
    for (let i = 0; i < a.n; i++) counts[learnedPick(idx, (j) => quality(a.stats[j]))]++;
    return { counts, quality: a.stats.map((s) => quality(s)) };
  },
});
/** Look up a game's question key (e2e). */
export const keyOf = internalQuery({ args: { slug: v.string() }, handler: async (ctx, a) => { const g = await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", a.slug)).unique(); return g ? { key: qKey(g), pair: pairOf(g) } : null; } });
