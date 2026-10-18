// sec-check: public projections. Explicit `returns` validators for every public query/mutation, so a future edit
// that returns a raw doc (hashes, session ids, spend) fails at runtime instead of leaking.
import { v } from "convex/values";
import { mode, status } from "./schema";

const sOrNull = v.union(v.string(), v.null());
const nOrNull = v.union(v.number(), v.null());
const winner = v.union(v.literal(0), v.literal(1), v.literal("draw"));

export const gameCreated = v.object({ slug: v.string(), seat: v.string(), invite: v.optional(v.string()) });
export const startResult = v.union(
  gameCreated,
  v.object({ slug: v.null(), seat: v.null(), invite: v.optional(v.string()), rejected: v.object({ category: v.string(), note: v.string() }) }),
);
export const claimResult = v.object({ slug: v.string(), seat: v.string() });
export const typeResult = v.object({ ok: v.boolean(), retryAfter: v.optional(v.number()) });
export const inviteResult = v.object({ invite: v.string() });
export const peekResult = v.object({
  state: v.string(), slug: sOrNull, hostName: sOrNull, hostCharacter: sOrNull, roundMs: v.number(), pele: v.boolean(), question: sOrNull,
});
const cornerView = v.object({
  kind: v.union(v.literal("agent"), v.literal("human")), pilot: v.union(v.literal("human"), v.literal("auto")),
  characterId: sOrNull, name: sOrNull, tag: sOrNull, model: sOrNull, modelLabel: sOrNull, modelSwapped: v.boolean(), filled: v.boolean(),
  draft: sOrNull, draftWords: v.number(), locked: v.boolean(), answer: sOrNull, answerWords: v.number(), streaming: v.boolean(),
  score: v.number(), final: v.boolean(), structure: nOrNull,
  history: v.array(v.object({ t: v.number(), s: v.number() })), answerHistory: v.array(v.object({ t: v.number(), text: v.string() })),
});
export const gameView = v.union(v.null(), v.object({
  slug: v.string(), roundMs: v.number(), pele: v.boolean(), mode, status, startsAt: nOrNull, endsAt: nOrNull,
  challenge: v.object({ text: v.string(), keywords: v.array(v.string()), custom: v.boolean() }), me: v.number(), isHost: v.boolean(),
  questionCheck: sOrNull, questionNote: sOrNull, winner: v.union(winner, v.null()), verdict: sOrNull, rematchOf: sOrNull, inviteOpen: v.boolean(),
  corners: v.array(cornerView),
}));
export const playersResult = v.object({
  week: v.string(),
  rows: v.array(v.object({ rank: v.number(), name: v.string(), tag: v.string(), points: v.number(), games: v.number(), wins: v.number(), losses: v.number(), draws: v.number(), avg: v.number(), me: v.boolean() })),
});
export const meResult = v.union(v.null(), v.object({
  name: v.string(), tag: v.string(), games: v.number(), wins: v.number(), losses: v.number(), draws: v.number(), points: v.number(),
  weekPoints: v.number(), weekGames: v.number(), bestScore: v.number(), bestSlug: sOrNull, streak: v.number(), bestStreak: v.number(), hva: v.string(), needed: v.number(),
}));
export const agentsResult = v.array(v.object({
  id: v.string(), name: v.string(), model: v.string(), games: v.number(), wins: v.number(), losses: v.number(), draws: v.number(),
  winPct: v.number(), avg: v.number(), vsHuman: v.string(), wilson: v.number(), ranked: v.boolean(), retired: v.boolean(),
  h2h: v.record(v.string(), v.object({ w: v.number(), l: v.number(), d: v.number() })),
}));
export const recentResult = v.array(v.object({
  slug: v.string(), mode: v.string(), finishedAt: v.number(), scores: v.array(v.number()), winner,
  corners: v.array(v.object({ kind: v.string(), characterId: sOrNull, name: v.string(), player: sOrNull })),
}));
export const presenceTokens = v.object({ roomToken: v.string(), sessionToken: v.string() });
export const presenceList = v.array(v.object({ userId: v.string(), online: v.boolean(), lastDisconnected: v.number() }));
