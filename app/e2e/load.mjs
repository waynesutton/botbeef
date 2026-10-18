// Concurrency load test: many simultaneous games (solo coach, you-vs-agent, duels, exhibitions) with fast typing,
// lock-ins and browser spectators on every game. Checks every game finishes with final scores.
// Then compare `npx convex insights --prod` before/after for OCC retries.
import { randomBytes } from "node:crypto";
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const CLOUD = S.replace(".convex.site", ".convex.cloud");
const N_SOLO = +(process.env.N_SOLO ?? 4), N_HVA = +(process.env.N_HVA ?? 4), N_DUEL = +(process.env.N_DUEL ?? 3), N_EXH = +(process.env.N_EXH ?? 2), SPECS = +(process.env.SPECS ?? 2);
const results = []; const ok = (n, c, x = "") => { results.push({ n, pass: !!c }); console.log(c ? "PASS" : "FAIL", n, x); };
const sec = () => randomBytes(24).toString("base64url");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BOTS = ["grokbot", "musey", "dotty", "sparkle", "deepy", "clawd", "kimmy", "hermy", "zozo", "townsy", "pinchy", "bolt"];
const LINES = "be dramatic and use a pun about rain then end with a mic drop and three short punchy lines about cats and coffee and a tiny twist at the very end".split(" ");
const cx = () => new ConvexHttpClient(CLOUD);

async function waitStatus(c, slug, pred, ms = 60000) {
  const t0 = Date.now();
  for (;;) { const v = await c.query(api.games.view, { slug }); if (v && pred(v)) return v; if (Date.now() - t0 > ms) return v; await sleep(400); }
}
async function typist(c, slug, seat, lock) {
  const v = await waitStatus(c, slug, (v) => v.status === "live" && Date.now() >= (v.startsAt ?? 0));
  if (v?.status !== "live") return { typed: 0 };
  let seq = 0, text = "", typed = 0, errs = 0;
  const stopAt = (v.endsAt ?? 0) - (lock ? 6000 : 800);
  // ~6 writes/s per seat, same cadence a fast typist produces with word-boundary sends
  for (let w = 0; Date.now() < stopAt; w = (w + 1) % LINES.length) {
    text = (text + " " + LINES[w]).trim().slice(0, 280);
    try { const r = await c.mutation(api.games.type, { slug, seat, seq: ++seq, text }); if (r?.ok) typed++; } catch { errs++; }
    await sleep(170);
  }
  if (lock) await c.mutation(api.games.lockIn, { slug, seat }).catch(() => errs++);
  return { typed, errs };
}
const games = [];
const t0 = Date.now();
const starts = [];
for (let i = 0; i < N_SOLO; i++) starts.push((async () => { const c = cx(); const r = await c.mutation(api.games.start, { secret: sec(), name: `Load Solo ${i}`, mode: "solo", characterId: BOTS[i % 12], roundMs: 30000 }); games.push({ kind: "solo", slug: r.slug, run: () => typist(c, r.slug, r.seat, i % 2 === 0) }); })());
for (let i = 0; i < N_HVA; i++) starts.push((async () => { const c = cx(); const r = await c.mutation(api.games.start, { secret: sec(), name: `Load Hva ${i}`, mode: "hva", opponentId: BOTS[(i + 3) % 12], roundMs: 30000 }); games.push({ kind: "hva", slug: r.slug, run: () => typist(c, r.slug, r.seat, i % 2 === 1) }); })());
for (let i = 0; i < N_EXH; i++) starts.push((async () => { const c = cx(); const r = await c.mutation(api.games.start, { secret: sec(), name: `Load Exh ${i}`, mode: "exhibition", characterId: BOTS[(i + 5) % 12], opponentId: BOTS[(i + 7) % 12], roundMs: 15000 }); games.push({ kind: "exhibition", slug: r.slug, run: async () => ({ typed: 0 }) }); })());
for (let i = 0; i < N_DUEL; i++) starts.push((async () => {
  const h = cx(), gu = cx();
  const r = await h.mutation(api.games.start, { secret: sec(), name: `Load Host ${i}`, mode: "duel", characterId: BOTS[i % 12], roundMs: 30000 });
  const tok = String(r.invite).split("/j/").pop();
  const j = await gu.mutation(api.games.claimInvite, { token: tok, secret: sec(), name: `Load Guest ${i}`, characterId: BOTS[(i + 6) % 12] });
  games.push({ kind: "duel", slug: r.slug, run: () => Promise.all([typist(h, r.slug, r.seat, true), typist(gu, j.slug, j.seat, true)]) });
})());
await Promise.all(starts);
ok(`started ${games.length} games at once`, games.length === N_SOLO + N_HVA + N_DUEL + N_EXH, `${Date.now() - t0} ms`);
// Spectators: real browsers so presence heartbeats + subscriptions run like production.
const b = await chromium.launch();
const pages = [];
await Promise.all(games.flatMap((g) => Array.from({ length: SPECS }, async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  const p = await ctx.newPage(); pages.push(p);
  await p.goto(`${S}/g/${g.slug}`, { waitUntil: "domcontentloaded" }).catch(() => {});
})));
ok(`opened ${pages.length} spectator tabs`, pages.length === games.length * SPECS);
const runs = await Promise.all(games.map((g) => g.run()));
const typed = runs.flat().reduce((s, r) => s + (r.typed ?? 0), 0), errs = runs.flat().reduce((s, r) => s + (r.errs ?? 0), 0);
ok("typing writes accepted", typed > 0 && errs === 0, `typed=${typed} errs=${errs}`);
// watchers count while live-ish
const w = await pages[0].locator(".watching b").first().textContent({ timeout: 10000 }).catch(() => null);
ok("spectator sees a watcher count", !!w, w ?? "");
const c = cx();
const finals = await Promise.all(games.map((g) => waitStatus(c, g.slug, (v) => ["finished", "no_contest", "ended"].includes(v.status), 150000)));
const fin = finals.filter((v) => v?.status === "finished").length;
ok("every game finished", fin === games.length, `${fin}/${games.length} ${finals.map((v) => v?.status).join(",")}`);
ok("every finished game has final scores for both corners", finals.every((v) => v?.status !== "finished" || v.corners.every((k) => k.final)));
ok("locked duel seats show locked", finals.filter((_, i) => games[i].kind === "duel").every((v) => v.corners.every((k) => k.locked)));
await b.close();
console.log(`elapsed ${Math.round((Date.now() - t0) / 1000)} s; slugs ${games.map((g) => g.slug).join(" ")}`);
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
