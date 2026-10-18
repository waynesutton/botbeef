// sec-check: public (leaderboards: display name, tag and stats only; see returns.ts)
import { onFinished } from "./learn";
import * as R from "./returns";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { CHARACTERS, MIN_AGENT_GAMES_TO_RANK, MIN_GAMES_TO_RANK, POINTS, charById, modelFor } from "./config";
import { dayKey, sha256, weekKey, isPublicResult } from "./lib";

type Outcome = "w" | "l" | "d";
const outcome = (winner: 0 | 1 | "draw", i: number): Outcome => (winner === "draw" ? "d" : winner === i ? "w" : "l");

export const noContest = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const g = await ctx.db.get(gameId);
    if (g?.status === "closing") await ctx.db.patch(gameId, { status: "no_contest", finishedAt: Date.now(), verdict: "The judge fell asleep. No contest. Free rematch!" });
  },
});

// Written in the same transaction that marks the game finished, so each game counts exactly once.
export const finish = internalMutation({
  args: { gameId: v.id("games"), finals: v.array(v.number()), winner: v.union(v.literal(0), v.literal(1), v.literal("draw")), verdict: v.string() },
  handler: async (ctx, a) => {
    const g = await ctx.db.get(a.gameId);
    if (!g || g.status !== "closing") return;
    const now = Date.now();
    await ctx.db.patch(g._id, { status: "finished", winner: a.winner, verdict: a.verdict, finishedAt: now });
    await onFinished(ctx, g, a.finals); // self-learning: completion + closeness for the question and the matchup
    if (await ctx.db.query("results").withIndex("by_game", (q) => q.eq("gameId", g._id)).unique()) return;
    const week = weekKey(now);
    await ctx.db.insert("results", {
      gameId: g._id, slug: g.slug, mode: g.mode, week, challengeId: g.challengeId, finishedAt: now, hidden: false,
      corners: g.corners.map((c) => ({ kind: c.kind, characterId: c.characterId, name: c.name, tag: c.tag })),
      scores: a.finals, winner: a.winner,
    });
    // Model scoreboard: one blind insert per agent corner (rolled up by models.rollup; no reads, no hot doc).
    for (let i = 0; i < 2; i++) {
      const c = g.corners[i];
      if (c.kind !== "agent" || !c.characterId) continue;
      await ctx.db.insert("modelGames", { t: now, model: modelFor(c.characterId, c.model).model, bot: c.characterId, score: a.finals[i], outcome: outcome(a.winner, i), vsHuman: g.corners[1 - i].kind === "human", logged: true, rolled: false });
    }
    // Agents (all modes, Exhibition included).
    for (let i = 0; i < 2; i++) {
      const c = g.corners[i];
      if (c.kind !== "agent" || !c.characterId) continue;
      const o = outcome(a.winner, i);
      const other = g.corners[1 - i];
      const vsKey = other.kind === "human" ? "human" : other.characterId ?? "?";
      const cur = await ctx.db.query("agentStats").withIndex("by_character", (q) => q.eq("characterId", c.characterId!)).unique();
      const base = cur ?? { characterId: c.characterId, games: 0, wins: 0, losses: 0, draws: 0, sumScore: 0, vsHumanGames: 0, vsHumanWins: 0, h2h: {} };
      const h2h: Record<string, { w: number; l: number; d: number }> = base.h2h;
      const h = h2h[vsKey] ?? { w: 0, l: 0, d: 0 };
      const next = {
        games: base.games + 1, wins: base.wins + (o === "w" ? 1 : 0), losses: base.losses + (o === "l" ? 1 : 0), draws: base.draws + (o === "d" ? 1 : 0),
        sumScore: base.sumScore + a.finals[i],
        vsHumanGames: base.vsHumanGames + (other.kind === "human" ? 1 : 0), vsHumanWins: base.vsHumanWins + (other.kind === "human" && o === "w" ? 1 : 0),
        h2h: { ...h2h, [vsKey]: { w: h.w + (o === "w" ? 1 : 0), l: h.l + (o === "l" ? 1 : 0), d: h.d + (o === "d" ? 1 : 0) } },
      };
      if (cur) await ctx.db.patch(cur._id, next); else await ctx.db.insert("agentStats", { characterId: c.characterId, ...next });
    }
    if (g.mode === "exhibition") return;
    const pts = POINTS[g.mode];
    const today = dayKey(now);
    for (let i = 0; i < 2; i++) {
      const c = g.corners[i];
      if (!c.sessionId) continue;
      const s = await ctx.db.get(c.sessionId);
      if (!s) continue;
      const day = s.dayKey === today ? s : { ...s, dayKey: today, dayPointGames: 0, daySolo: 0, dayHva: 0, dayPairs: {} as Record<string, number> };
      const o = outcome(a.winner, i);
      const otherSid = g.corners[1 - i].sessionId;
      const pairKey = otherSid ? String(otherSid) : "";
      const eligible = day.dayPointGames < 20 && (g.mode === "solo" ? day.daySolo < 10 : g.mode === "hva" ? day.dayHva < 10 : (day.dayPairs[pairKey] ?? 0) < 3);
      const earned = eligible ? (o === "w" ? pts.win : o === "d" ? pts.draw : pts.loss) : 0;
      const sc = a.finals[i];
      const streak = o === "w" ? s.streak + 1 : 0;
      await ctx.db.patch(s._id, {
        dayKey: today,
        dayPointGames: day.dayPointGames + (eligible ? 1 : 0),
        daySolo: day.daySolo + (g.mode === "solo" ? 1 : 0),
        dayHva: day.dayHva + (g.mode === "hva" ? 1 : 0),
        dayPairs: g.mode === "duel" ? { ...day.dayPairs, [pairKey]: (day.dayPairs[pairKey] ?? 0) + 1 } : day.dayPairs,
        daySpend: s.dayKey === today ? s.daySpend : 0,
        points: s.points + earned, games: s.games + 1, wins: s.wins + (o === "w" ? 1 : 0), losses: s.losses + (o === "l" ? 1 : 0), draws: s.draws + (o === "d" ? 1 : 0),
        sumScore: s.sumScore + sc, streak, bestStreak: Math.max(s.bestStreak, streak),
        ...(sc > s.bestScore ? { bestScore: sc, bestSlug: g.slug } : {}),
        hvaWins: s.hvaWins + (g.mode === "hva" && o === "w" ? 1 : 0), hvaLosses: s.hvaLosses + (g.mode === "hva" && o === "l" ? 1 : 0),
      });
      const pw = await ctx.db.query("playerWeeks").withIndex("by_session_week", (q) => q.eq("sessionId", s._id).eq("week", week)).unique();
      const add = { points: earned, games: 1, wins: o === "w" ? 1 : 0, losses: o === "l" ? 1 : 0, draws: o === "d" ? 1 : 0, sumScore: sc };
      if (pw) await ctx.db.patch(pw._id, { points: pw.points + add.points, games: pw.games + 1, wins: pw.wins + add.wins, losses: pw.losses + add.losses, draws: pw.draws + add.draws, sumScore: pw.sumScore + sc });
      else await ctx.db.insert("playerWeeks", { sessionId: s._id, week, ...add });
    }
  },
});

type Row = { points: number; games: number; wins: number; losses: number; draws: number; sumScore: number; name: string; tag: string; me: boolean };
const rank = (rows: Row[]) => rows
  .filter((r) => r.games >= MIN_GAMES_TO_RANK)
  .sort((x, y) => y.points - x.points || y.sumScore / y.games - x.sumScore / x.games || y.wins - x.wins)
  .slice(0, 50)
  .map((r, i) => ({ rank: i + 1, name: r.name, tag: r.tag, points: r.points, games: r.games, wins: r.wins, losses: r.losses, draws: r.draws, avg: Math.round(r.sumScore / r.games), me: r.me }));

export const players = query({
  args: { tab: v.union(v.literal("week"), v.literal("all")), secret: v.optional(v.string()) },
  returns: R.playersResult,
  handler: async (ctx, a) => {
    const myHash = a.secret ? await sha256(a.secret) : "";
    const week = weekKey(Date.now());
    let rows: Row[];
    if (a.tab === "week") {
      const pw = await ctx.db.query("playerWeeks").withIndex("by_week_points", (q) => q.eq("week", week)).order("desc").take(200);
      rows = (await Promise.all(pw.map(async (p) => { const s = await ctx.db.get(p.sessionId); return s ? { ...p, name: s.name, tag: s.tag, me: s.secretHash === myHash } : null; }))).filter((r): r is NonNullable<typeof r> => !!r);
    } else {
      const ss = await ctx.db.query("sessions").withIndex("by_points").order("desc").take(200);
      rows = ss.map((s) => ({ ...s, me: s.secretHash === myHash }));
    }
    return { week, rows: rank(rows) };
  },
});

export const me = query({
  args: { secret: v.string() },
  returns: R.meResult,
  handler: async (ctx, a) => {
    const h = await sha256(a.secret);
    const s = await ctx.db.query("sessions").withIndex("by_secret", (q) => q.eq("secretHash", h)).unique();
    if (!s) return null;
    const pw = await ctx.db.query("playerWeeks").withIndex("by_session_week", (q) => q.eq("sessionId", s._id).eq("week", weekKey(Date.now()))).unique();
    return {
      name: s.name, tag: s.tag, games: s.games, wins: s.wins, losses: s.losses, draws: s.draws, points: s.points,
      weekPoints: pw?.points ?? 0, weekGames: pw?.games ?? 0, bestScore: s.bestScore, bestSlug: s.bestSlug ?? null,
      streak: s.streak, bestStreak: s.bestStreak, hva: `${s.hvaWins}-${s.hvaLosses}`, needed: Math.max(0, MIN_GAMES_TO_RANK - s.games),
    };
  },
});

// Wilson score lower bound (95%) so a 2-for-2 newcomer doesn't top a 600-for-1,000 veteran.
const wilson = (w: number, n: number) => { if (!n) return 0; const z = 1.96, p = w / n; return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n); };
export const agents = query({
  args: {},
  returns: R.agentsResult,
  handler: async (ctx) => {
    const all = await ctx.db.query("agentStats").collect();
    return CHARACTERS.map((c) => {
      const s: Partial<Doc<"agentStats">> = all.find((x) => x.characterId === c.id) ?? {};
      const games = s.games ?? 0, wins = s.wins ?? 0;
      return {
        id: c.id, name: c.name, model: c.model, games, wins, losses: s.losses ?? 0, draws: s.draws ?? 0,
        winPct: games ? Math.round((100 * wins) / games) : 0, avg: games ? Math.round((s.sumScore ?? 0) / games) : 0,
        vsHuman: `${s.vsHumanWins ?? 0}/${s.vsHumanGames ?? 0}`, wilson: wilson(wins, games), ranked: !c.retired && games >= MIN_AGENT_GAMES_TO_RANK, retired: !!c.retired,
        h2h: s.h2h ?? {},
      };
    }).filter((a) => !a.retired || a.games > 0).sort((x, y) => Number(x.retired) - Number(y.retired) || Number(y.ranked) - Number(x.ranked) || y.wilson - x.wilson || y.games - x.games);
  },
});

export const recent = query({
  args: {},
  returns: R.recentResult,
  handler: async (ctx) => {
    const rs = await ctx.db.query("results").withIndex("by_finished").order("desc").take(40);
    return rs.filter(isPublicResult).slice(0, 20).map((r) => ({
      slug: r.slug, mode: r.mode, finishedAt: r.finishedAt, scores: r.scores, winner: r.winner,
      corners: r.corners.map((c) => ({ kind: c.kind, characterId: c.characterId ?? null, name: c.kind === "human" ? `${c.name ?? "Human"}#${c.tag ?? ""}` : charById(c.characterId)?.name ?? "Bot", player: c.name ? `${c.name}#${c.tag}` : null })),
    }));
  },
});

/** Latest public finished games for sitemap.xml. */
export const sitemapGames = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("results").withIndex("by_finished").order("desc").take(300)).filter(isPublicResult).map((r) => ({ slug: r.slug, t: r.finishedAt })),
});
