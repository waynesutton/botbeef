import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { randomBytes } from "node:crypto";
const c = new ConvexHttpClient(process.env.URL ?? "https://small-mallard-255.convex.cloud");
const secret = randomBytes(32).toString("base64url");
let n = 0, err = "";
for (let i = 0; i < 8; i++) { try { await c.mutation(api.games.start, { secret, name: "Rate Tester", mode: "duel", characterId: "bolt" }); n++; } catch (e) { err = JSON.stringify(e.data); break; } }
console.log("starts allowed before limit:", n, "->", err);
for (const name of ["ab", "admin", "x".repeat(40)]) { try { const r = await c.mutation(api.games.start, { secret: randomBytes(32).toString("base64url"), name, mode: "duel" }); console.log("name", JSON.stringify(name), "accepted as slug", r.slug); } catch (e) { console.log("name", JSON.stringify(name.slice(0, 10)), "rejected:", JSON.stringify(e.data)); } }
