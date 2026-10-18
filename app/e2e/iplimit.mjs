// sec-check #1: the per-IP start limit (30 burst) blocks session-rotation farming. Duel lobbies only (no AI spend).
// Run against a deployment where this runner's IP is NOT in BB_TRUSTED_IPS (e.g. dev): CLOUD=https://<dev>.convex.cloud
import { randomBytes } from "node:crypto";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
const c = new ConvexHttpClient(process.env.CLOUD ?? "https://amicable-wren-353.convex.cloud");
let okN = 0, blocked = null;
for (let i = 0; i < 40 && !blocked; i++) {
  try { await c.mutation(api.games.start, { secret: randomBytes(24).toString("base64url"), name: `Ip Test ${i}`, mode: "duel", characterId: "musey" }); okN++; }
  catch (e) { blocked = String(e.data ?? e.message ?? e); } // prod redacts message; ConvexError data survives
}
// A fresh bucket allows 30; a rerun inside the refill window allows fewer. Either way it must stop at <= 30 with the IP message.
const pass = okN <= 30 && /from your network/.test(blocked ?? "");
console.log(pass ? "PASS" : "FAIL", `ip limit: ${okN} starts allowed, then: ${blocked?.slice(0, 120)}`);
process.exit(pass ? 0 : 1);
