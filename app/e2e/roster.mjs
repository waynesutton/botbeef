// E2E: roster change. Bolt retired (not offered, not picked, history kept), Hermy playable end to end.
import { chromium, devices } from "/tmp/pw/node_modules/playwright/index.mjs";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
import { randomBytes } from "node:crypto";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share";
const results = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const imgs = (p) => p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
const b = await chromium.launch();
for (const [scheme, file] of [["light", "34-picker-mobile-light.png"], ["dark", "34b-picker-mobile-dark.png"]]) {
  const c = await b.newContext({ ...devices["iPhone 13"], colorScheme: scheme }); const p = await c.newPage();
  await p.addInitScript((t) => localStorage.setItem("bb.theme", t), scheme);
  await p.goto(S + "/"); await p.waitForSelector("button.char"); await imgs(p);
  const names = await p.locator("button.char").allTextContents();
  if (scheme === "light") {
    ok("picker has Hermy", names.some((n) => /Hermy/.test(n)), names.join(" | "));
    ok("picker has The House, no Bolt", names.some((n) => /The House/.test(n)) && !names.some((n) => /Bolt/.test(n)));
    ok("picker keeps Clawd and the rest (13)", ["Grokbot", "Musey", "Dotty", "Sparkle", "Deepy", "Clawd", "Kimmy", "Hermy", "Hunch", "Zozo", "Townsy", "Pinchy", "The House"].every((k) => names.some((n) => n.includes(k))) && names.length === 13, `${names.length} characters`);
    for (const k of ["grokbot", "musey", "dotty", "sparkle", "deepy", "clawd", "kimmy", "hermy", "hunch", "zozo", "townsy", "pinchy", "house"]) ok(`picker shows ${k} full-body art`, (await p.locator(`button.char img[src="/c/${k}.full.v1.webp"]`).evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false)));
  }
  await p.locator("button.char").first().locator("xpath=..").screenshot({ path: `${OUT}/${file}` });
  await c.close();
}
const D = await b.newContext({ viewport: { width: 1280, height: 860 } }); const dp = await D.newPage();
await dp.goto(S + "/"); await dp.waitForSelector("button.char"); await imgs(dp);
await dp.locator("button.char").first().locator("xpath=..").screenshot({ path: `${OUT}/34c-picker-desktop.png` });
for (const [n, k] of [["46", "Hunch"], ["47", "Zozo"], ["48", "Townsy"], ["51", "Pinchy"], ["51b", "Clawd"]]) { await dp.click(`button.char:has-text('${k}')`); await dp.locator(`button.char:has-text('${k}')`).screenshot({ path: `${OUT}/${n}-card-${k.toLowerCase()}.png` }); }

// New brand characters play end to end (Hunch vs Zozo, Townsy vs Hermy).
const cx0 = new ConvexHttpClient(S.replace(".convex.site", ".convex.cloud"));
const games = await Promise.all([["hunch", "zozo"], ["townsy", "hermy"], ["pinchy", "clawd"]].map(([a, o]) => cx0.mutation(api.games.start, { secret: randomBytes(32).toString("base64url"), name: "Roster New", mode: "exhibition", characterId: a, opponentId: o, roundMs: 15000 })));
const fin = async (slug) => { const t = Date.now(); let g; while (Date.now() - t < 90000) { g = await cx0.query(api.games.view, { slug }); if (g.status === "finished" || g.status === "no_contest") return g; await new Promise((r) => setTimeout(r, 2000)); } return g; };
const done = await Promise.all(games.map((g) => fin(g.slug)));
for (const g of done) { ok(`${g.corners[0].characterId} vs ${g.corners[1].characterId} finishes with real answers`, g.status === "finished" && g.corners.every((c) => (c.answer ?? "").split(/\s+/).length >= 3), `${g.corners.map((c) => `${c.characterId}:${Math.round(c.score)}`).join(" vs ")} | ${g.corners.map((c) => (c.answer ?? "").slice(0, 50)).join(" || ")}`); }
for (const [i, file] of [[0, "49-hunch-vs-zozo-reveal.png"], [1, "50-townsy-vs-hermy-reveal.png"], [2, "52-pinchy-vs-clawd-reveal.png"]]) { const rp = await D.newPage(); await rp.goto(`${S}/g/${games[i].slug}`); await rp.waitForSelector(".reveal"); await imgs(rp); await rp.screenshot({ path: `${OUT}/${file}`, fullPage: true }); await rp.close(); }

const cx = new ConvexHttpClient(S.replace(".convex.site", ".convex.cloud"));
const secret = randomBytes(32).toString("base64url");
const ex = await cx.mutation(api.games.start, { secret, name: "Roster Test", mode: "exhibition", characterId: "hermy", opponentId: "bolt" });
let v; const t0 = Date.now();
while (Date.now() - t0 < 90000) { v = await cx.query(api.games.view, { slug: ex.slug }); if (v.status === "finished" || v.status === "no_contest") break; await new Promise((r) => setTimeout(r, 2000)); }
ok("Hermy vs The House exhibition finishes", v.status === "finished" && v.corners[1].characterId === "bolt", `${v.status} ${v.corners.map((c) => `${c.characterId}:${Math.round(c.score)}`).join(" vs ")}`);
ok("Hermy (Hermes 4 405B) streams a real answer", (v.corners[0].answer ?? "").split(/\s+/).length >= 8, (v.corners[0].answer ?? "").slice(0, 80));
ok("The House answers in character", (v.corners[1].answer ?? "").split(/\s+/).length >= 8, (v.corners[1].answer ?? "").slice(0, 80));
const wp = await D.newPage(); await wp.goto(`${S}/g/${ex.slug}`); await wp.waitForSelector(".reveal"); await imgs(wp);
await wp.screenshot({ path: `${OUT}/38-hermy-vs-the-house-reveal.png`, fullPage: true });
const wt = await wp.locator("body").innerText();
ok("watch page shows The House, never Bolt", wt.includes("The House") && !/\bBolt\b/.test(wt) && (await wp.locator('img[src="/c/house.full.v1.webp"]').count()) > 0);
const og = (await (await fetch(`${S}/g/${ex.slug}`)).text()).match(/property="og:image" content="([^"]*)"/)?.[1];
ok("matchup OG image hermy-vs-house", /\/og\/hermy-vs-house\.v3\.jpg$/.test(og ?? "") && (await fetch(og)).ok, og);
const ag = await cx.query(api.leaderboard.agents, {});
ok("leaderboard lists Hermy", ag.some((a) => a.id === "hermy"));
const house = ag.find((a) => a.id === "bolt");
ok("The House keeps Bolt's history, active", house && house.name === "The House" && house.games > 1 && !house.retired, house && `${house.wins}-${house.losses}-${house.draws}`);
const old = (await cx.query(api.leaderboard.recent, {})).filter((r) => r.slug !== ex.slug).find((r) => JSON.stringify(r).includes('"bolt"'));
if (old) { const op = await D.newPage(); await op.goto(`${S}/g/${old.slug}`); await op.waitForSelector(".reveal, .arena"); const t = await op.locator("body").innerText(); ok("past game renders as The House (name, art, verdict)", t.includes("The House") && !/\bBolt\b/.test(t), old.slug); }
const llms = await (await fetch(`${S}/llms.txt`)).text(), agents = await (await fetch(`${S}/agents.md`)).text(), home = await (await fetch(`${S}/`)).text();
ok("llms.txt / agents.md / home SEO list Hermy + The House, no Bolt/Fayaz/robot-heads", [llms, agents, home].every((t) => t.includes("Hermy") && t.includes("The House") && !/Bolt|fayaz|robot-heads/i.test(t)));
ok("llms.txt / agents.md / home SEO list Hunch, Zozo, Townsy, Pinchy", [llms, agents, home].every((t) => ["Hunch", "Zozo", "Townsy", "Pinchy"].every((k) => t.includes(k))));
ok("Clawd reads as Claude, Pinchy as OpenClaw, footer credits OpenClaw", agents.includes("Clawd: Claude (Anthropic) vibe") && agents.includes("Pinchy: OpenClaw vibe") && (await dp.locator("footer").innerText()).includes("OpenClaw"));
await b.close();
const fails = results.filter((r) => !r.pass);
console.log(JSON.stringify({ ex: ex.slug, pass: results.length - fails.length, total: results.length }));
