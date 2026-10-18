import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const mode = v.union(v.literal("solo"), v.literal("hva"), v.literal("duel"), v.literal("exhibition"));
export const status = v.union(
  v.literal("lobby"), v.literal("setup"), v.literal("countdown"), v.literal("live"), v.literal("closing"),
  v.literal("finished"), v.literal("no_contest"), v.literal("ended"), v.literal("abandoned"),
);
export const corner = v.object({
  kind: v.union(v.literal("agent"), v.literal("human")),
  pilot: v.union(v.literal("human"), v.literal("auto")),
  characterId: v.optional(v.string()),
  sessionId: v.optional(v.id("sessions")),
  name: v.optional(v.string()),
  tag: v.optional(v.string()),
  seatHash: v.optional(v.string()),
  // Per-game model swap: one of config.MODEL_OPTIONS[characterId]. Unset = the bot's default.
  model: v.optional(v.string()),
});

export default defineSchema({
  sessions: defineTable({
    secretHash: v.string(),
    name: v.string(),
    tag: v.string(),
    createdAt: v.number(),
    dayKey: v.string(),
    dayPointGames: v.number(),
    daySolo: v.number(),
    dayHva: v.number(),
    daySpend: v.number(),
    dayPairs: v.record(v.string(), v.number()),
    // all-time stats
    points: v.number(),
    games: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    sumScore: v.number(),
    bestScore: v.number(),
    bestSlug: v.optional(v.string()),
    hvaWins: v.number(),
    hvaLosses: v.number(),
    streak: v.number(),
    bestStreak: v.number(),
  }).index("by_secret", ["secretHash"]).index("by_points", ["points"]),

  games: defineTable({
    slug: v.string(),
    roundMs: v.optional(v.number()),
    mode,
    status,
    hostSessionId: v.id("sessions"),
    challengeId: v.string(),
    question: v.optional(v.string()),
    pele: v.optional(v.boolean()),
    questionState: v.optional(v.union(v.literal("pending"), v.literal("ok"), v.literal("rejected"), v.literal("error"))),
    // "rotation" = an approved player question the game picked automatically (shown as a normal Challenge, not "your question").
    questionSource: v.optional(v.literal("rotation")),
    positionSwap: v.boolean(),
    corners: v.array(corner),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    inviteHash: v.optional(v.string()),
    inviteExpiresAt: v.optional(v.number()),
    inviteUsedAt: v.optional(v.number()),
    rematchOf: v.optional(v.string()),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
    winner: v.optional(v.union(v.literal(0), v.literal(1), v.literal("draw"))),
    verdict: v.optional(v.string()),
    // Hot counters no longer live on the game doc while it is in play: ticks ride in the tick action's args,
    // and cost is rolled up from spendLog by a cron after the game ends.
    ticks: v.number(),
    costUsd: v.number(),
    aiCalls: v.number(),
  }).index("by_slug", ["slug"]).index("by_invite", ["inviteHash"]).index("by_status", ["status", "createdAt"]),

  // One row per corner. Draft = what a human types (a prompt in pilot modes, the answer in hva).
  drafts: defineTable({
    gameId: v.id("games"),
    corner: v.number(),
    text: v.string(),
    seq: v.number(),
    updatedAt: v.number(),
    // Legacy (pre cornerState split). Only typing data is written here now; see cornerState.
    lockedAt: v.optional(v.number()),
    refreshedWords: v.optional(v.number()),
    refreshedText: v.optional(v.string()),
    refreshedAt: v.optional(v.number()),
    refreshes: v.optional(v.number()),
    refreshPending: v.optional(v.boolean()),
  }).index("by_game", ["gameId", "corner"]),

  // Engine-owned per-corner state, split from drafts so keystroke writes (drafts) and refresh/lock writes
  // (here) never touch the same doc. Written by begin, lockIn, beginClose, startAnswer, endRefresh, and by
  // type only when it arms a refresh.
  cornerState: defineTable({
    gameId: v.id("games"),
    corner: v.number(),
    lockedAt: v.optional(v.number()),
    refreshedWords: v.number(),
    refreshedText: v.string(),
    refreshedAt: v.number(),
    refreshes: v.number(),
    refreshPending: v.boolean(),
  }).index("by_game", ["gameId", "corner"]),

  // One row per agent corner. `full` is the hidden autopilot answer that gets drip-fed into `text`.
  answers: defineTable({
    gameId: v.id("games"),
    corner: v.number(),
    model: v.string(),
    text: v.string(),
    full: v.optional(v.string()),
    version: v.number(),
    streaming: v.boolean(),
    history: v.array(v.object({ t: v.number(), text: v.string() })),
  }).index("by_game", ["gameId", "corner"]),

  scores: defineTable({
    gameId: v.id("games"),
    corner: v.number(),
    score: v.number(),
    confidence: v.number(),
    scoredText: v.string(),
    flagged: v.boolean(),
    isFinal: v.boolean(),
    structure: v.optional(v.number()),
    history: v.array(v.object({ t: v.number(), s: v.number() })),
  }).index("by_game", ["gameId", "corner"]),

  results: defineTable({
    gameId: v.id("games"),
    slug: v.string(),
    mode,
    week: v.string(),
    corners: v.array(v.object({ kind: v.string(), characterId: v.optional(v.string()), name: v.optional(v.string()), tag: v.optional(v.string()) })),
    scores: v.array(v.number()),
    winner: v.union(v.literal(0), v.literal(1), v.literal("draw")),
    challengeId: v.string(),
    finishedAt: v.number(),
    hidden: v.boolean(),
  }).index("by_game", ["gameId"]).index("by_finished", ["finishedAt"]),

  playerWeeks: defineTable({
    sessionId: v.id("sessions"),
    week: v.string(),
    points: v.number(),
    games: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    sumScore: v.number(),
  }).index("by_week_points", ["week", "points"]).index("by_session_week", ["sessionId", "week"]),

  agentStats: defineTable({
    characterId: v.string(),
    games: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    sumScore: v.number(),
    vsHumanGames: v.number(),
    vsHumanWins: v.number(),
    h2h: v.record(v.string(), v.object({ w: v.number(), l: v.number(), d: v.number() })),
  }).index("by_character", ["characterId"]),

  // Question rotation: player-written questions that passed BOTH moderation layers. Rejected text never lands here (or anywhere).
  userQuestions: defineTable({
    key: v.string(), // normalized text (moderation.questionKey), the dedupe key
    text: v.string(),
    source: v.literal("user"),
    approvedAt: v.number(),
    uses: v.number(),
    removed: v.boolean(), // admin tombstone: stays out of rotation and can't be re-added
    removedAt: v.optional(v.number()),
  }).index("by_key", ["key"]).index("by_live", ["removed", "approvedAt"]),
  // Moderation counters only: day (PT), layer and category. Never the text.
  moderationStats: defineTable({ day: v.string(), layer: v.union(v.literal("local"), v.literal("jev")), category: v.string(), count: v.number() }).index("by_key", ["day", "layer", "category"]),

  // Light self-learning (no model training): outcome counters per auto question and per bot matchup.
  // key = built-in challenge id, or "rot:<normalized text>" for a rotation question. Host-typed questions aren't tracked.
  questionStats: defineTable({ key: v.string(), games: v.number(), completed: v.number(), abandoned: v.number(), rematches: v.number(), closeSum: v.number() }).index("by_key", ["key"]),
  // pair = the two character ids sorted and joined with "|" (bots only; human corners are skipped).
  matchupStats: defineTable({ pair: v.string(), games: v.number(), closeSum: v.number() }).index("by_pair", ["pair"]),

  // Append-only AI cost log: spend.record only inserts (no reads, so it can never OCC-conflict).
  // The spend.rollup cron folds settled rows into spend / games.costUsd / sessions.daySpend and deletes them.
  spendLog: defineTable({ t: v.number(), usd: v.number(), gameId: v.optional(v.id("games")) }).index("by_t", ["t"]),
  spend: defineTable({ month: v.string(), shard: v.number(), usd: v.number(), calls: v.number() }).index("by_month", ["month", "shard"]),
  alertsSent: defineTable({ month: v.string(), threshold: v.number(), sentAt: v.number(), ok: v.boolean(), detail: v.string() }).index("by_month", ["month", "threshold"]),
});
