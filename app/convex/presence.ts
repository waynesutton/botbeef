// sec-check: public (anonymous viewer counts; random viewer ids, no PII)
// Live viewer counts per game via the Convex Presence component (no polling; clients only hear joins/leaves).
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { presenceList, presenceTokens } from "./returns";

const presence = new Presence(components.presence);
const ROOM_CAP = 200;
const ROOM = /^g:[0-9A-Za-z]{10}$/, ID = /^[A-Za-z0-9_-]{8,64}$/;

export const heartbeat = mutation({
  args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
  returns: presenceTokens,
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    if (!ROOM.test(roomId) || !ID.test(userId) || sessionId.length > 200) throw new ConvexError("Bad presence args");
    // sec-check #3: cap distinct viewers per room. Known viewers (already online in this room) skip the room scan,
    // so steady heartbeats only read their own user's rows and never the whole room.
    const mine = await presence.listUser(ctx, userId, true, 50);
    if (!mine.some((r) => r.roomId === roomId) && (await presence.listRoom(ctx, roomId, true, ROOM_CAP)).length >= ROOM_CAP) {
      throw new ConvexError("This battle has a full house. Try again in a bit!");
    }
    return await presence.heartbeat(ctx, roomId, userId, sessionId, Math.min(60_000, Math.max(10_000, interval)));
  },
});

// Online viewers only, capped; same args for everyone in the room so the subscription is shared.
export const list = query({
  args: { roomToken: v.string() },
  returns: presenceList,
  handler: async (ctx, { roomToken }) =>
    (await presence.list(ctx, roomToken, 100)).filter((p) => p.online).map(({ userId, online, lastDisconnected }) => ({ userId, online, lastDisconnected })),
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => { await presence.disconnect(ctx, sessionToken); return null; },
});
