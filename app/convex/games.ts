// sec-check: public (anonymous game API: seat/secret hashes gate writes; every return is a projection, see returns.ts)
import { v, ConvexError } from "convex/values";
import { mutation, query, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mode as modeV } from "./schema";
import {
  ROSTER, isActive, ALLOW_MIRROR, RANDOM, CHALLENGES, COUNTDOWN_MS, DEFAULT_MS, isDuration, gameMs, maxRefreshes, MAX_CHARS, INVITE_TTL_MS, SESSION_DAILY_USD,
  REFRESH_MIN_MS, REFRESH_MIN_WORDS, charById, challengeOf, words, type Mode, modelFor, isAllowedModel,
  cleanQuestion, QUESTION_MIN, QUESTION_MAX, questionNote, isHostQuestion, ROTATION_SHARE,
} from "./config";
import { localCheck, type ModCategory } from "./moderation";
import { bump, addApproved, pickRotation } from "./rotation";
import { onAbandoned, onRematch, pickChallengeId } from "./learn";
import { livePool, finalPool, rateLimiter, slug as mkSlug, token as mkToken, sha256, cleanName, seatCorner, gameBySlug, dayKey, limitByIp, isPublicGame } from "./lib";
import * as R from "./returns";

type Corner = Doc<"games">["corners"][number];

async function upsertSession(ctx: MutationCtx, secret: string, rawName: string) {
  if (secret.length < 32 || secret.length > 128) throw new ConvexError("Bad session.");
  const name = cleanName(rawName);
  const secretHash = await sha256(secret);
  const now = Date.now();
  const today = dayKey(now);
  let s = await ctx.db.query("sessions").withIndex("by_secret", (q) => q.eq("secretHash", secretHash)).unique();
  if (!s) {
    await rateLimiter.limit(ctx, "newSession", { throws: true });
    const id = await ctx.db.insert("sessions", {
      secretHash, name, tag: secretHash.slice(0, 3).toUpperCase(), createdAt: now,
      dayKey: today, dayPointGames: 0, daySolo: 0, dayHva: 0, daySpend: 0, dayPairs: {},
      points: 0, games: 0, wins: 0, losses: 0, draws: 0, sumScore: 0, bestScore: 0,
      hvaWins: 0, hvaLosses: 0, streak: 0, bestStreak: 0,
    });
    s = (await ctx.db.get(id))!;
  } else {
    const patch: Partial<Doc<"sessions">> = { name };
    if (s.dayKey !== today) Object.assign(patch, { dayKey: today, dayPointGames: 0, daySolo: 0, dayHva: 0, daySpend: 0, dayPairs: {} });
    await ctx.db.patch(s._id, patch);
    s = { ...s, ...patch };
  }
  return s;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const validChar = (id?: string) => (isActive(id) ? id! : pick(ROSTER).id);

/** Exhibition slot: unset/"random" = let the game pick; anything else must be an active roster bot. */
const slot = (id: string | undefined, strict: boolean) => {
  if (!id || id === RANDOM) return undefined;
  if (isActive(id)) return id;
  if (strict) throw new ConvexError("Pick a bot from the roster (or Random).");
  return undefined;
};

type Q = { text: string; vetted: boolean } | undefined;
type Blocked = { blocked: ModCategory; note: string };
/** Validate the host's optional question. Blank means auto. Layer 1 (local check) runs here, before anything is stored;
 *  layer 2 (Jev) runs later in an action (setup / vetQuestion). */
export function parseQuestion(raw: string | undefined): Q | Blocked {
  if (raw === undefined) return undefined;
  if (raw.length > 2000) throw new ConvexError(`Keep your question to ${QUESTION_MAX} characters.`);
  const text = cleanQuestion(raw);
  if (!text) return undefined;
  if (text.length < QUESTION_MIN || text.length > QUESTION_MAX) throw new ConvexError(`Questions need ${QUESTION_MIN} to ${QUESTION_MAX} characters.`);
  const lc = localCheck(text);
  if (!lc.ok) return { blocked: lc.category, note: lc.note };
  return { text, vetted: false };
}

/** A requested model must be on that bot's allowlist; the default is stored as unset. */
const pickModel = (characterId: string | undefined, model: string | undefined) => {
  if (!model) return undefined;
  if (!characterId || !isAllowedModel(characterId, model)) throw new ConvexError("That model isn't available for this bot.");
  return model === modelFor(characterId).model ? undefined : model;
};
type Models = { mine?: string; theirs?: string };
async function createGame(ctx: MutationCtx, host: Doc<"sessions">, mode: Mode, characterId?: string, opponentId?: string, rematchOf?: string, roundMs: number = DEFAULT_MS, q?: Q, pele?: boolean, models: Models = {}) {
  if (!isDuration(roundMs)) throw new ConvexError("Pick 15, 30 or 45 seconds.");
  await rateLimiter.limit(ctx, "startSession", { key: host._id, throws: true });
  await rateLimiter.limit(ctx, "startGlobal", { throws: true });
  if (host.daySpend >= SESSION_DAILY_USD) throw new ConvexError("You've battled a lot today. Come back tomorrow!");
  const seat = mkToken();
  const seatHash = await sha256(seat);
  const me = { sessionId: host._id, name: host.name, tag: host.tag, seatHash };
  let corners: Corner[];
  let invite: string | undefined;
  if (mode === "solo") corners = [{ kind: "agent", pilot: "human", characterId: validChar(characterId), ...me }, { kind: "agent", pilot: "auto" }];
  else if (mode === "hva") corners = [{ kind: "human", pilot: "human", ...me }, { kind: "agent", pilot: "auto" }];
  else if (mode === "duel") { corners = [{ kind: "agent", pilot: "human", characterId: validChar(characterId), ...me }, { kind: "agent", pilot: "human" }]; invite = mkToken(); }
  else {
    // Host picks both corners; Random left = uniform pick, Random right = Jev picks the most fun rival in setup.
    const l = slot(characterId, !rematchOf), r = slot(opponentId, !rematchOf);
    if (l && r && l === r && !ALLOW_MIRROR) throw new ConvexError("No mirror matches. Pick two different bots.");
    const a = l ?? pick(ROSTER.filter((c) => c.id !== r)).id;
    const b = r && (ALLOW_MIRROR || r !== a) ? r : undefined;
    corners = [{ kind: "agent", pilot: "auto", characterId: a, seatHash }, { kind: "agent", pilot: "auto", characterId: b }];
  }
  // Model choice only applies to a bot the player actually picked (not to Random or a Jev-picked rival).
  const mineModel = mode === "hva" ? undefined : pickModel(mode === "exhibition" ? slot(characterId, false) : corners[0].characterId, models.mine);
  if (mineModel) corners[0].model = mineModel;
  if (mode === "exhibition") { const r = pickModel(corners[1].characterId, corners[1].characterId ? models.theirs : undefined); if (r) corners[1].model = r; }
  else if (models.theirs) throw new ConvexError("That model isn't available for this bot.");
  const s = mkSlug();
  // No host question: sometimes play an approved player question from the rotation (shown as a regular Challenge).
  const rot = q ? null : await pickRotation(ctx, ROTATION_SHARE);
  const gameId = await ctx.db.insert("games", {
    slug: s, roundMs, mode, status: mode === "duel" ? "lobby" : "setup", hostSessionId: host._id,
    challengeId: await pickChallengeId(ctx), question: q?.text ?? rot ?? undefined, questionState: q ? (q.vetted ? "ok" : "pending") : rot ? "ok" : undefined, questionSource: rot ? "rotation" : undefined, pele: pele || undefined, positionSwap: Math.random() < 0.5, corners,
    inviteHash: invite ? await sha256(invite) : undefined,
    inviteExpiresAt: invite ? Date.now() + INVITE_TTL_MS : undefined,
    rematchOf, createdAt: Date.now(), ticks: 0, costUsd: 0, aiCalls: 0,
  });
  if (mode !== "duel") await finalPool.enqueueAction(ctx, internal.engine.setup, { gameId });
  else if (q && !q.vetted) await finalPool.enqueueAction(ctx, internal.engine.vetQuestion, { gameId });
  return { slug: s, seat, invite };
}

export const start = mutation({
  args: { secret: v.string(), name: v.string(), mode: modeV, characterId: v.optional(v.string()), opponentId: v.optional(v.string()), roundMs: v.optional(v.number()), question: v.optional(v.string()), pele: v.optional(v.boolean()),
    model: v.optional(v.string()), opponentModel: v.optional(v.string()) },
  returns: R.startResult,
  handler: async (ctx, a) => {
    const q = parseQuestion(a.question);
    if (q && "blocked" in q) {
      // Nothing about the text is kept: only the category is counted. No game is created.
      await bump(ctx, "local", q.blocked);
      return { slug: null, seat: null, invite: undefined, rejected: { category: q.blocked, note: q.note } };
    }
    await limitByIp(ctx);
    const host = await upsertSession(ctx, a.secret, a.name);
    return await createGame(ctx, host, a.mode, a.characterId, a.opponentId, undefined, a.roundMs ?? DEFAULT_MS, q, a.pele, { mine: a.model, theirs: a.opponentModel });
  },
});

export const rematch = mutation({
  args: { secret: v.string(), slug: v.string() },
  returns: R.gameCreated,
  handler: async (ctx, a) => {
    const g = await gameBySlug(ctx, a.slug);
    if (!g) throw new ConvexError("Game not found.");
    const sh = await sha256(a.secret);
    const host = await ctx.db.get(g.hostSessionId);
    if (!host || host.secretHash !== sh) throw new ConvexError("Only the host can rematch. Start your own!");
    await limitByIp(ctx);
    const s = await upsertSession(ctx, a.secret, host.name);
    const mine = g.corners[0];
    await onRematch(ctx, g);
    return await createGame(ctx, s, g.mode, mine.characterId, g.mode === "exhibition" ? g.corners[1].characterId : undefined, g.slug, gameMs(g),
      isHostQuestion(g) && localCheck(g.question!).ok ? { text: g.question!, vetted: true } : undefined, g.pele,
      { mine: g.corners[0].model, theirs: g.mode === "exhibition" ? g.corners[1].model : undefined });
  },
});

const verdictV = v.object({ state: v.union(v.literal("ok"), v.literal("rejected"), v.literal("error")), category: v.optional(v.string()) });
/** Jev's verdict on a pending host question. Anything but a pass (rejected, error, timeout) wipes the text from the game:
 *  only the state (for the host's note) and a category count survive. A pass adds the question to the rotation. */
async function settleQuestion(ctx: MutationCtx, g: Doc<"games">, vd: { state: "ok" | "rejected" | "error"; category?: string }) {
  if (vd.state === "ok") {
    await ctx.db.patch(g._id, { questionState: "ok" });
    await addApproved(ctx, { ...g, questionState: "ok" });
    return;
  }
  await ctx.db.patch(g._id, { questionState: vd.state, question: undefined });
  await bump(ctx, "jev", vd.state === "rejected" ? vd.category ?? "unknown" : `error:${vd.category ?? "unknown"}`);
}

// Called by engine.setup once the opponent is picked: arm the clock and create per-corner rows.
export const begin = internalMutation({
  args: { gameId: v.id("games"), corners: v.optional(v.array(v.object({ i: v.number(), characterId: v.string() }))), renameHost: v.optional(v.boolean()), question: v.optional(verdictV) },
  handler: async (ctx, a) => {
    const g = await ctx.db.get(a.gameId);
    if (!g || (g.status !== "setup" && g.status !== "lobby")) return;
    const corners = g.corners.map((c) => ({ ...c }));
    for (const x of a.corners ?? []) corners[x.i].characterId = x.characterId;
    for (const c of corners) if (c.kind === "agent" && !c.characterId) c.characterId = pick(ROSTER.filter((x) => !corners.some((o) => o.characterId === x.id))).id;
    if (a.renameHost && corners[0].name) corners[0].name = "Player";
    // The question is settled before the clock starts: a check still in flight counts as failed (auto question).
    const now = Date.now();
    const startsAt = now + COUNTDOWN_MS;
    const endsAt = startsAt + gameMs(g);
    await ctx.db.patch(g._id, { corners, status: "countdown", startsAt, endsAt });
    if (g.questionState === "pending") await settleQuestion(ctx, g, a.question ?? { state: "error", category: "timeout" });
    for (let i = 0; i < 2; i++) {
      const c = corners[i];
      await ctx.db.insert("drafts", { gameId: g._id, corner: i, text: "", seq: 0, updatedAt: now });
      await ctx.db.insert("cornerState", { gameId: g._id, corner: i, ...CS0 });
      await ctx.db.insert("scores", { gameId: g._id, corner: i, score: 0, confidence: 0, scoredText: "", flagged: false, isFinal: false, history: [] });
      if (c.kind === "agent") {
        await ctx.db.insert("answers", { gameId: g._id, corner: i, model: modelFor(c.characterId, c.model).model, text: "", version: 0, streaming: false, history: [] });
      }
    }
    // One batched enqueue for all autopilot corners (fewer workpool kicks per game start).
    const autos = corners.flatMap((c, i) => (c.kind === "agent" && c.pilot === "auto" ? [{ gameId: g._id, corner: i }] : []));
    if (autos.length) await finalPool.enqueueActionBatch(ctx, internal.engine.autopilot, autos);
    await livePool.enqueueAction(ctx, internal.engine.tick, { gameId: g._id }, { runAt: startsAt });
    await finalPool.enqueueAction(ctx, internal.engine.close, { gameId: g._id }, { runAt: endsAt });
  },
});

export const type = mutation({
  args: { slug: v.string(), seat: v.string(), seq: v.number(), text: v.string() },
  returns: R.typeResult,
  handler: async (ctx, a) => {
    const g = await gameBySlug(ctx, a.slug);
    if (!g) throw new ConvexError("Game not found.");
    const i = await seatCorner(g, a.seat);
    if (i < 0 || g.corners[i].pilot !== "human") throw new ConvexError("Not your seat.");
    if (g.status !== "live" && g.status !== "countdown") return { ok: false };
    const now = Date.now();
    if (g.endsAt && now > g.endsAt) return { ok: false };
    const lim = await rateLimiter.limit(ctx, "draft", { key: `${g._id}:${i}` });
    if (!lim.ok) return { ok: false, retryAfter: lim.retryAfter };
    const d = await ctx.db.query("drafts").withIndex("by_game", (q) => q.eq("gameId", g._id).eq("corner", i)).unique();
    if (!d || a.seq <= d.seq) return { ok: false };
    const cs = await cornerStateOf(ctx, g._id, i, d);
    if (cs.lockedAt) return { ok: false };
    const text = a.text.slice(0, MAX_CHARS);
    if (text === d.text) return { ok: true }; // no-op write skipped: same text, nothing for readers to see
    await ctx.db.patch(d._id, { text, seq: a.seq, updatedAt: now });
    if (g.status === "live" && g.corners[i].kind === "agent" && !cs.refreshPending && cs.refreshes < maxRefreshes(gameMs(g))
      && words(text) - cs.refreshedWords >= REFRESH_MIN_WORDS && now - cs.refreshedAt >= REFRESH_MIN_MS) {
      await setCornerState(ctx, g._id, i, cs, { refreshPending: true });
      await livePool.enqueueAction(ctx, internal.engine.refresh, { gameId: g._id, corner: i, final: false });
    }
    return { ok: true };
  },
});

export const lockIn = mutation({
  args: { slug: v.string(), seat: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const g = await gameBySlug(ctx, a.slug);
    if (!g) throw new ConvexError("Game not found.");
    const i = await seatCorner(g, a.seat);
    if (i < 0 || g.corners[i].pilot !== "human") throw new ConvexError("Not your seat.");
    if (g.status !== "live") return;
    const mine = await cornerStateOf(ctx, g._id, i);
    if (mine.lockedAt) return; // already locked: no write, no second close
    await setCornerState(ctx, g._id, i, mine, { lockedAt: Date.now() });
    const other = 1 - i;
    const allLocked = g.corners[other].pilot !== "human" || !!(await cornerStateOf(ctx, g._id, other)).lockedAt;
    if (allLocked) await finalPool.enqueueAction(ctx, internal.engine.close, { gameId: g._id });
  },
});

export const endGame = mutation({
  args: { slug: v.string(), seat: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const g = await gameBySlug(ctx, a.slug);
    if (!g || (await seatCorner(g, a.seat)) !== 0) throw new ConvexError("Only the host can end this game.");
    if (["finished", "no_contest", "ended", "abandoned"].includes(g.status)) return;
    await ctx.db.patch(g._id, { status: "ended", finishedAt: Date.now() });
    if (g.status === "live" || g.status === "countdown") await onAbandoned(ctx, g); // quit mid-game: the question didn't hold them
  },
});

// ---------- Duel invites (single-use, hashed, 30-minute expiry) ----------
async function inviteGame(ctx: QueryCtx, t: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(t)) return null;
  const h = await sha256(t);
  return await ctx.db.query("games").withIndex("by_invite", (q) => q.eq("inviteHash", h)).unique();
}
const inviteState = (g: Doc<"games"> | null) =>
  !g ? "invalid" : g.inviteUsedAt || g.corners[1].seatHash ? "taken" : g.status !== "lobby" ? "closed" : (g.inviteExpiresAt ?? 0) < Date.now() ? "expired" : "open";

export const peekInvite = query({
  args: { token: v.string() },
  returns: R.peekResult,
  handler: async (ctx, a) => {
    const g = await inviteGame(ctx, a.token);
    const state = inviteState(g);
    if (!g) return { state, slug: null, hostName: null, hostCharacter: null, roundMs: DEFAULT_MS, pele: false, question: null as string | null };
    return { state, slug: g.slug, hostName: g.corners[0].name ?? "Someone", hostCharacter: g.corners[0].characterId ?? null, roundMs: gameMs(g), pele: !!g.pele, question: isHostQuestion(g) ? g.question! : null };
  },
});

export const claimInvite = mutation({
  args: { token: v.string(), secret: v.string(), name: v.string(), characterId: v.string(), model: v.optional(v.string()) },
  returns: R.claimResult,
  handler: async (ctx, a) => {
    await rateLimiter.limit(ctx, "invite", { key: (await sha256(a.secret)).slice(0, 16), throws: true });
    const g = await inviteGame(ctx, a.token);
    const state = inviteState(g);
    if (!g || state !== "open") throw new ConvexError(state === "taken" ? "This seat is taken. Watch the battle instead?" : "This invite is no longer valid.");
    await limitByIp(ctx);
    const guest = await upsertSession(ctx, a.secret, a.name);
    if (guest._id === g.hostSessionId) throw new ConvexError("You can't duel yourself. Send the link to a friend!");
    const seat = mkToken();
    const corners = g.corners.map((c) => ({ ...c }));
    const taken = corners[0].characterId;
    const characterId = isActive(a.characterId) && a.characterId !== taken ? a.characterId! : ROSTER.find((c) => c.id !== taken)!.id;
    corners[1] = { kind: "agent", pilot: "human", characterId, sessionId: guest._id, name: guest.name, tag: guest.tag, seatHash: await sha256(seat) };
    const gm = characterId === a.characterId ? pickModel(characterId, a.model) : undefined; // guest picks their own bot's model
    if (gm) corners[1].model = gm;
    await ctx.db.patch(g._id, { corners, inviteUsedAt: Date.now(), status: "setup" });
    await ctx.scheduler.runAfter(0, internal.games.begin, { gameId: g._id });
    return { slug: g.slug, seat };
  },
});

export const regenerateInvite = mutation({
  args: { slug: v.string(), seat: v.string() },
  returns: R.inviteResult,
  handler: async (ctx, a) => {
    const g = await gameBySlug(ctx, a.slug);
    if (!g || (await seatCorner(g, a.seat)) !== 0 || g.mode !== "duel") throw new ConvexError("Only the host can do that.");
    await rateLimiter.limit(ctx, "regenInvite", { key: String(g.hostSessionId), throws: true });
    if (g.status !== "lobby" || g.corners[1].seatHash) throw new ConvexError("The seat is already filled.");
    const invite = mkToken();
    await ctx.db.patch(g._id, { inviteHash: await sha256(invite), inviteExpiresAt: Date.now() + INVITE_TTL_MS });
    return { invite };
  },
});

// ---------- Public projection (privacy enforced here, never by CSS) ----------
export const view = query({
  args: { slug: v.string(), seat: v.optional(v.string()) },
  returns: R.gameView,
  handler: async (ctx, a) => {
    const g = await gameBySlug(ctx, a.slug);
    if (!g) return null;
    const me = await seatCorner(g, a.seat);
    if (me < 0 && !(await isPublicGame(ctx, g))) return null; // hidden games: only their players still see them
    const done = ["finished", "no_contest", "ended"].includes(g.status);
    const duel = g.mode === "duel";
    const drafts = await ctx.db.query("drafts").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect();
    const states = await ctx.db.query("cornerState").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect();
    const answers = await ctx.db.query("answers").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect();
    const scores = await ctx.db.query("scores").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect();
    const c = challengeOf(g);
    return {
      slug: g.slug, roundMs: gameMs(g), pele: !!g.pele, mode: g.mode, status: g.status, startsAt: g.startsAt ?? null, endsAt: g.endsAt ?? null,
      challenge: { text: c.text, keywords: c.keywords, custom: isHostQuestion(g) }, me, isHost: me === 0,
      questionCheck: me === 0 && g.question && g.questionState === "pending" ? g.question : null,
      questionNote: me === 0 ? questionNote(g) : null,
      winner: g.winner ?? null, verdict: g.verdict ?? null, rematchOf: g.rematchOf ?? null,
      inviteOpen: duel && g.status === "lobby" && !g.corners[1].seatHash,
      corners: g.corners.map((k, i) => {
        const d = drafts.find((x) => x.corner === i);
        const an = answers.find((x) => x.corner === i);
        const sc = scores.find((x) => x.corner === i);
        const hidden = duel && !done && me !== i; // duel: only the writer sees their own text until the reveal
        const flagged = !!sc?.flagged && me !== i;
        return {
          kind: k.kind, pilot: k.pilot, characterId: k.characterId ?? null, name: k.name ?? null, tag: k.tag ?? null,
          model: k.kind === "agent" && k.characterId ? modelFor(k.characterId, k.model).model : null,
          modelLabel: k.kind === "agent" && k.characterId ? modelFor(k.characterId, k.model).label : null, modelSwapped: !!k.model,
          filled: k.pilot === "auto" || !!k.seatHash,
          draft: hidden || flagged ? null : (d?.text ?? ""),
          draftWords: words(d?.text ?? ""),
          locked: !!(states.find((x) => x.corner === i)?.lockedAt ?? d?.lockedAt),
          answer: an ? (hidden ? null : flagged ? "[filtered]" : an.text) : null,
          answerWords: an ? words(an.text) : 0,
          streaming: an?.streaming ?? false,
          score: sc?.score ?? 0, final: sc?.isFinal ?? false, structure: g.pele && !hidden ? sc?.structure ?? null : null, history: sc?.history ?? [],
          answerHistory: done && an ? an.history : [],
        };
      }),
    };
  },
});

// ---------- Internal helpers for the engine ----------
export const getGame = internalQuery({ args: { gameId: v.id("games") }, handler: (ctx, a) => ctx.db.get(a.gameId) });
export const bySlug = internalQuery({ args: { slug: v.string() }, handler: (ctx, a) => gameBySlug(ctx, a.slug) });
/** SSR /g/:slug: same visibility rule as view (a hidden game renders the generic page). */
export const publicBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, a) => { const g = await gameBySlug(ctx, a.slug); return g && (await isPublicGame(ctx, g)) ? g : null; },
});
export const rows = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, a) => {
    const g = await ctx.db.get(a.gameId);
    const drafts = await ctx.db.query("drafts").withIndex("by_game", (q) => q.eq("gameId", a.gameId)).collect();
    const states = await ctx.db.query("cornerState").withIndex("by_game", (q) => q.eq("gameId", a.gameId)).collect();
    const answers = await ctx.db.query("answers").withIndex("by_game", (q) => q.eq("gameId", a.gameId)).collect();
    const scores = await ctx.db.query("scores").withIndex("by_game", (q) => q.eq("gameId", a.gameId)).collect();
    return { g, drafts, states, answers, scores };
  },
});
export type Rows = { g: Doc<"games"> | null; drafts: Doc<"drafts">[]; states: Doc<"cornerState">[]; answers: Doc<"answers">[]; scores: Doc<"scores">[] };

// ---------- cornerState: engine-owned per-corner fields (point reads by [gameId, corner]) ----------
export const CS0 = { refreshedWords: 0, refreshedText: "", refreshedAt: 0, refreshes: 0, refreshPending: false };
type CS = Omit<Doc<"cornerState">, "_id" | "_creationTime"> & { _id?: Id<"cornerState"> };
/** Point read; games started before the split fall back to the legacy fields on their draft row. */
export async function cornerStateOf(ctx: QueryCtx, gameId: Id<"games">, corner: number, draft?: Doc<"drafts"> | null): Promise<CS> {
  const cs = await ctx.db.query("cornerState").withIndex("by_game", (q) => q.eq("gameId", gameId).eq("corner", corner)).first();
  if (cs) return cs;
  const d = draft ?? (await ctx.db.query("drafts").withIndex("by_game", (q) => q.eq("gameId", gameId).eq("corner", corner)).first());
  return { gameId, corner, lockedAt: d?.lockedAt, refreshedWords: d?.refreshedWords ?? 0, refreshedText: d?.refreshedText ?? "", refreshedAt: d?.refreshedAt ?? 0, refreshes: d?.refreshes ?? 0, refreshPending: d?.refreshPending ?? false };
}
export async function setCornerState(ctx: MutationCtx, gameId: Id<"games">, corner: number, cs: CS, patch: Partial<CS>) {
  if (cs._id) await ctx.db.patch(cs._id, patch);
  else { const { _id, ...base } = cs; void _id; await ctx.db.insert("cornerState", { ...base, ...patch, gameId, corner }); }
}
export type GameId = Id<"games">;

/** Duel lobby: record the moderation result for the host's question (setup does this inline for other modes). */
export const setQuestionState = internalMutation({
  args: { gameId: v.id("games"), verdict: verdictV },
  handler: async (ctx, a) => {
    const g = await ctx.db.get(a.gameId);
    if (g?.questionState === "pending") await settleQuestion(ctx, g, a.verdict);
  },
});
