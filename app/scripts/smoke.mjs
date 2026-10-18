// Backend smoke: play one Solo (or hva) game through the public API and print the result.
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { randomBytes } from "node:crypto";
const url = process.env.URL; const mode = process.argv[2] ?? "solo";
const c = new ConvexHttpClient(url);
const secret = randomBytes(32).toString("base64url");
const { slug, seat } = await c.mutation(api.games.start, { secret, name: "Smoke Test", mode, characterId: "grokbot" });
console.log("slug", slug);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let v;
while ((v = await c.query(api.games.view, { slug, seat }))?.status !== "live") { await sleep(300); if (v?.status === "finished") break; }
console.log("live", v.challenge.text, v.corners.map((x) => x.characterId));
const text = mode === "hva"
  ? "Listen up rival, your code is so slow that even dial-up modems laugh at you. I write faster, think sharper, and I have snacks. Game over, toaster brain, go reboot yourself."
  : "Be savage but playful. Mention their slow loading times and that they still use dial up internet. End with a mic drop line about rebooting.";
const ws = text.split(" "); let seq = 0;
for (let i = 1; i <= ws.length; i++) { await c.mutation(api.games.type, { slug, seat, seq: ++seq, text: ws.slice(0, i).join(" ") }); await sleep(450); }
const t0 = Date.now();
for (;;) {
  v = await c.query(api.games.view, { slug, seat });
  process.stdout.write(`\r${v.status} ${v.corners.map((x) => x.score.toFixed(1)).join(" vs ")}   `);
  if (["finished", "no_contest"].includes(v.status)) break;
  if (Date.now() - t0 > 90000) break;
  await sleep(1000);
}
console.log("\n", JSON.stringify({ status: v.status, winner: v.winner, verdict: v.verdict, corners: v.corners.map((x) => ({ c: x.characterId, s: x.score, ans: x.answer, hist: x.history.length })) }, null, 1));
