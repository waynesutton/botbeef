// One-off: the house bot was renamed Bolt -> The House. Rewrite the name in stored AI text (verdicts, agent answers) of past games.
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const fix = (s: string) => s.replace(/\bBolt's\b/g, "The House's").replace(/\bBolt\b/g, "The House");
export const renameHouse = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("games").paginate({ cursor: cursor ?? null, numItems: 100 });
    let n = 0;
    for (const g of page.page) {
      if (!g.corners.some((c) => c.characterId === "bolt")) continue;
      if (g.verdict && fix(g.verdict) !== g.verdict) { await ctx.db.patch(g._id, { verdict: fix(g.verdict) }); n++; }
      for (const a of await ctx.db.query("answers").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect()) {
        const text = fix(a.text), full = a.full && fix(a.full), history = a.history.map((h) => ({ ...h, text: fix(h.text) }));
        if (text !== a.text || full !== a.full || JSON.stringify(history) !== JSON.stringify(a.history)) { await ctx.db.patch(a._id, { text, full, history }); n++; }
      }
    }
    return { patched: n, done: page.isDone, cursor: page.continueCursor };
  },
});
