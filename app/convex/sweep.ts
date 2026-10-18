import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
// Abandon 24h-old lobbies; re-close any game whose clock ran out but never closed. Nothing is deleted.
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const g of await ctx.db.query("games").withIndex("by_status", (q) => q.eq("status", "lobby").lt("createdAt", now - 86_400_000)).take(100)) await ctx.db.patch(g._id, { status: "abandoned" });
    for (const st of ["live", "countdown"] as const)
      for (const g of await ctx.db.query("games").withIndex("by_status", (q) => q.eq("status", st).lt("createdAt", now - 120_000)).take(50))
        if ((g.endsAt ?? 0) < now - 30_000) await ctx.scheduler.runAfter(0, internal.engine.close, { gameId: g._id });
    for (const g of await ctx.db.query("games").withIndex("by_status", (q) => q.eq("status", "closing").lt("createdAt", now - 300_000)).take(50))
      if ((g.endsAt ?? 0) < now - 120_000) await ctx.scheduler.runAfter(0, internal.leaderboard.noContest, { gameId: g._id });
    for (const g of await ctx.db.query("games").withIndex("by_status", (q) => q.eq("status", "setup").lt("createdAt", now - 120_000)).take(50))
      await ctx.scheduler.runAfter(0, internal.games.begin, { gameId: g._id });
  },
});
