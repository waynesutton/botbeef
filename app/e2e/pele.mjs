// E2E: Pele mode. Toggle, lazy-loaded maps that grow per finished word, duel privacy, sticky-strip fit with the keyboard open,
// expand, reveal, Jev's structure score, reduced motion and no errors.
import { randomBytes } from "node:crypto";
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share/pele";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const mk = async (vp = { width: 1100, height: 860 }, extra = {}) => { const c = await b.newContext({ viewport: vp, userAgent: UA, ...extra }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); p.chunks = []; p.on("request", (r) => { if (/\/assets\/(mindmap|core)-[^/]+\.js$/.test(r.url())) p.chunks.push(r.url()); }); return p; };
const cx = new ConvexHttpClient(S.replace(".convex.site", ".convex.cloud"));
const sx = () => randomBytes(32).toString("base64url");
const view = (slug, seat) => cx.query(api.games.view, seat ? { slug, seat } : { slug });
const until = async (slug, pred, ms = 90000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await view(slug); if (pred(v)) return v; await new Promise((r) => setTimeout(r, 700)); } return v; };
const done = (v) => ["finished", "no_contest", "ended"].includes(v.status);
const imgs = (p) => p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
const nodes = (p, sel) => p.evaluate((s) => document.querySelector(s)?.getAttribute("data-nodes") ?? null, sel);

// ---------- 1. toggle + lazy load ----------
const H = await mk();
await H.goto(S + "/"); await H.waitForSelector(".pele-t");
const sw = H.locator(".pele-t");
ok("toggle: slim switch under Start, ON by default for a new visitor", (await sw.getAttribute("role")) === "switch" && (await sw.getAttribute("aria-checked")) === "true" && (await H.evaluate(() => localStorage.getItem("bb.pele"))) === null);
await sw.click(); ok("toggle: turns off", (await sw.getAttribute("aria-checked")) === "false");
await H.reload(); await H.waitForSelector(".pele-t");
ok("toggle: a saved 'off' is kept across visits", (await H.locator(".pele-t").getAttribute("aria-checked")) === "false" && (await H.evaluate(() => localStorage.getItem("bb.pele"))) === "0");
await H.locator(".pele-t").click(); await H.reload(); await H.waitForSelector(".pele-t");
ok("toggle: remembered like length (back on)", (await H.locator(".pele-t").getAttribute("aria-checked")) === "true");
ok("lazy: no Pele code on the home page", H.chunks.length === 0, H.chunks.join(","));
const home = await (await fetch(S + "/")).text();
ok("home page (server copy) mentions Pele mode + credit", /Pele mode/.test(home) && /pele\.run/.test(home));
{ const ll = await (await fetch(S + "/llms.txt")).text(), ag = await (await fetch(S + "/agents.md")).text();
  ok("llms.txt + agents.md describe Pele mode and credit obsidianmd", /## Pele mode/.test(ll) && /obsidianmd\/pele/.test(ll) && /## Pele mode/.test(ag)); }
ok("footer credits Pele (pele.run, obsidianmd)", (await H.locator("footer a[href='https://pele.run']").count()) === 1 && (await H.locator("footer a[href='https://github.com/obsidianmd/pele']").count()) === 1);
ok("FAQ on home has 'What is Pele mode?'", (await H.locator("details summary:has-text('What is Pele mode?')").count()) === 1);

// ---------- 2. HvA on a phone: the map grows per finished word, strip shows shape + count, keyboard-open fit ----------
const P = await mk({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
await P.goto(S + "/"); await P.fill("#nm", "Pele Pat"); await P.click("button.mode:has-text('You vs Agent')");
await P.click(".seg button:has-text('30s')"); if ((await P.locator(".pele-t").getAttribute("aria-checked")) !== "true") await P.click(".pele-t"); await P.click("button.btn.big");
await P.waitForURL(/\/play\//); const hslug = P.url().split("/").pop();
ok("server: Pele mode stored on the game", (await view(hslug)).pele === true);
await P.waitForSelector("#draft:not([disabled])", { timeout: 30000 });
ok("lazy: Pele core + mindmap chunks load in a Pele game", P.chunks.some((u) => /mindmap-/.test(u)) && P.chunks.some((u) => /core-/.test(u)), P.chunks.map((u) => u.split("/").pop()).join(","));
const S0 = ".strip-f.s0 .strip-map";
await P.waitForSelector(S0);
ok("strip: map chip with node count", (await nodes(P, S0)) === "0" && (await P.locator(S0).getAttribute("aria-label")) === "0 map nodes");
const seq = []; const step = async (t) => { await P.type("#draft", t, { delay: 25 }); await P.waitForTimeout(700); seq.push(await nodes(P, S0)); };
await P.evaluate(() => { window.__pops = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.querySelectorAll?.(".pm-new").forEach((g) => window.__pops.push(getComputedStyle(g).animationName))))).observe(document.body, { subtree: true, childList: true }); });
await step("gravity");            // unfinished word: not drawn
await step(" test,");             // finished clause -> 1 branch
await step(" cats are tiny physicists and"); // 2nd clause
await step(" mugs are data,");    // 3rd
await step(" revenge for breakfast late again "); // 4th clause + a leaf (more than 3 words)
ok("maps grow per finished word (unfinished word not drawn)", seq[0] === "0" && +seq[1] === 1 && +seq[2] === 2 && +seq[3] === 3 && +seq[4] >= 5, seq.join(" -> "));
{ const pops = await P.evaluate(() => window.__pops); ok("pop-in on new nodes in the live lane map", pops.length > 0 && pops.every((a) => a === "pm-pop"), `${pops.length} pops`); }
ok("strip thumbnail is a real Pele SVG", (await P.locator(`${S0} svg.pele`).count()) === 1);
// keyboard open: shrink to the visual viewport above a phone keyboard
await P.setViewportSize({ width: 390, height: 420 }); await P.waitForTimeout(600);
const fit = await P.evaluate(() => {
  const vh = window.visualViewport?.height ?? innerHeight, vw = innerWidth;
  const sel = [".strip .s0 .av", ".strip .s1 .av", ".strip-f.s0 .strip-map", ".strip-f.s1 .strip-map", ".tug", ".strip .timer", ".la0 .la-t", "#draft", ".composer button.btn"];
  const bad = sel.filter((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return !r || r.height < 8 || r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1; });
  const st = document.querySelector(".stage");
  return { bad, stageFits: !!st && st.scrollHeight <= st.clientHeight + 1, strip: Math.round(document.querySelector(".strip").getBoundingClientRect().height) };
});
ok("keyboard open: strip + badges + lanes + composer all fit, no stage scroll", fit.bad.length === 0 && fit.stageFits, JSON.stringify(fit));
await P.screenshot({ path: `${OUT}/02-mobile-keyboard-open.png` });
await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(600);
ok("roomy phone: the typing lane shows the live map too", await P.locator(".la0 .la-map .pele").isVisible());
await P.screenshot({ path: `${OUT}/01-mobile-battle.png` });
// expand from the strip (the bot's puppet): its full map shows under the 2D puppet
await P.waitForSelector(".strip .s1 .av.tap", { timeout: 15000 }).catch(() => {});
await P.waitForFunction(() => +document.querySelector(".strip-f.s1 .strip-map")?.getAttribute("data-nodes") > 0, null, { timeout: 15000 }).catch(() => {});
await P.locator(".strip .s1 .av.tap").tap().catch(() => {});
await P.waitForSelector(".xv .xv-extra .pm-full svg.pele", { timeout: 8000 }).catch(() => {});
ok("expand: full map in the tap-to-expand view", +(await nodes(P, ".xv .xv-extra .pm-full")) >= 1, await nodes(P, ".xv .xv-extra .pm-full"));
await P.waitForTimeout(500); await P.screenshot({ path: `${OUT}/03-mobile-expand.png` });
await P.locator(".xv-x").click().catch(() => {});
await P.click("button:has-text('Lock in')").catch(() => {});
const hv = await until(hslug, done, 60000);
ok("structure score: Jev returns 0-100 per side in Pele mode", hv.corners.every((c) => typeof c.structure === "number" && c.structure >= 0 && c.structure <= 100), hv.corners.map((c) => `${Math.round(c.score)}/${c.structure}`).join(" "));
await P.waitForSelector(".reveal .rv-maps", { timeout: 20000 });
ok("reveal: both full maps with structure scores", (await P.locator(".rv-maps .rv-map").count()) === 2 && /structure \d+\/100/.test(await P.locator(".rv-maps").textContent()));
await P.waitForTimeout(800); await P.locator(".reveal").screenshot({ path: `${OUT}/04-mobile-reveal.png` });

// ---------- 3. structure only in Pele mode; bots follow the clause line ----------
{ const r = await cx.mutation(api.games.start, { secret: sx(), name: "Map Show", mode: "exhibition", roundMs: 15000, pele: true, characterId: "deepy", opponentId: "kimmy" });
  const r2 = await cx.mutation(api.games.start, { secret: sx(), name: "Plain Show", mode: "exhibition", roundMs: 15000, characterId: "zozo", opponentId: "townsy" });
  const W = await mk(); await W.goto(`${S}/g/${r.slug}`);
  const [v, v2] = await Promise.all([until(r.slug, done), until(r2.slug, done)]);
  ok("exhibition (Pele): Jev structure score on both sides", v.status === "finished" && v.corners.every((c) => typeof c.structure === "number"), v.corners.map((c) => c.structure).join(","));
  ok("non-Pele game: no structure score, pele=false", v2.pele === false && v2.corners.every((c) => c.structure === null));
  await W.waitForSelector(".rv-maps", { timeout: 20000 });
  const bn = await W.evaluate(() => [...document.querySelectorAll(".rv-map .pm")].map((e) => +e.getAttribute("data-nodes")));
  ok("bots answer in short clauses (>= 3 nodes each map)", bn.length === 2 && bn.every((n) => n >= 3), bn.join(","));
  ok("watch page battle boxes show both maps after the reveal", (await W.locator(".fighter .pm-box svg.pele").count()) === 2);
  await W.waitForTimeout(800); await W.screenshot({ path: `${OUT}/05-watch-reveal-desktop.png`, fullPage: true }); }

// ---------- 4. duel privacy ----------
{ const D = await mk(), G = await mk({ width: 390, height: 844 }), V = await mk();
  await D.goto(S + "/"); await D.fill("#nm", "Map Host"); await D.click("button.mode:has-text('Duel')"); await D.click("button.char:has-text('Clawd')");
  await D.click(".seg button:has-text('15s')"); if ((await D.locator(".pele-t").getAttribute("aria-checked")) !== "true") await D.click(".pele-t");
  await D.click("button.btn.big"); await D.waitForURL(/\/play\//); const slug = D.url().split("/").pop();
  await D.waitForSelector("code.link"); const invite = await D.locator("code.link").textContent();
  await G.goto(invite); await G.waitForSelector("text=called you out");
  ok("duel invite mentions Pele mode", /Pele mode is on/.test(await G.locator(".sub").first().textContent()));
  await G.fill("#nm2", "Map Guest"); await G.click("button.char:has-text('Hunch')"); await G.click("button:has-text('Accept the battle')");
  await G.waitForURL(/\/play\//); await V.goto(`${S}/g/${slug}`);
  await Promise.all([D.waitForSelector("#draft:not([disabled])", { timeout: 20000 }), G.waitForSelector("#draft:not([disabled])", { timeout: 20000 })]);
  await Promise.all([D.type("#draft", "HOSTMAP zebras, umbrellas, volcano picnic, short clauses please, be bold ", { delay: 40 }), G.type("#draft", "GUESTMAP penguins, tubas, moon bounce, short clauses please, be loud ", { delay: 40 })]);
  await Promise.all([D, G].map((x, k) => x.waitForFunction((s) => +document.querySelector(s)?.getAttribute("data-nodes") > 0, `.strip-f.s${k} .strip-map`, { timeout: 12000 }).catch(() => {})));
  const own = await nodes(D, ".strip-f.s0 .strip-map"), rival = await nodes(D, ".strip-f.s1 .strip-map"), gRival = await nodes(G, ".strip-f.s0 .strip-map");
  ok("duel: each player sees their own map live", +own > 0 && +(await nodes(G, ".strip-f.s1 .strip-map")) > 0 && (await nodes(G, ".strip-f.s1 .strip-map")) !== "hidden", `host own=${own}`);
  ok("duel: the rival's map is hidden until the reveal (both sides)", rival === "hidden" && gRival === "hidden");
  const dh = await D.content(), gh = await G.content(), vh = await V.content();
  ok("duel: no rival map labels leak into the DOM", !/GUESTMAP|penguins/i.test(dh) && !/HOSTMAP|zebras/i.test(gh));
  ok("duel watch page: maps hidden until the reveal", (await V.locator(".pm-hidden").count()) === 2 && (await V.locator(".fighter .pm-box").count()) === 0 && !/zebras|penguins/i.test(vh));
  await Promise.all([D.click("button:has-text('Lock in')"), G.click("button:has-text('Lock in')")]);
  await V.waitForSelector(".reveal .rv-maps", { timeout: 60000 }); await V.waitForTimeout(1000);
  const after = await V.content();
  ok("duel reveal: both maps public", (await V.locator(".rv-map svg.pele").count()) === 2 && /zebras/i.test(after) && /penguins/i.test(after)); }

// ---------- 5. reduced motion: no pop-in while a live exhibition grows ----------
{ const r = await cx.mutation(api.games.start, { secret: sx(), name: "Calm Show", mode: "exhibition", roundMs: 15000, pele: true, characterId: "sparkle", opponentId: "pinchy" });
  const R = await mk({ width: 1100, height: 860 }, { reducedMotion: "reduce" });
  await R.goto(`${S}/g/${r.slug}`);
  await R.evaluate(() => { window.__pops = []; window.__drawn = 0; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.matches?.("svg.pele")) window.__drawn++; n.querySelectorAll?.(".pm-new").forEach((g) => window.__pops.push(getComputedStyle(g).animationName)); }))).observe(document.body, { subtree: true, childList: true }); });
  await R.waitForSelector(".reveal", { timeout: 60000 });
  const st = await R.evaluate(() => ({ pops: window.__pops, drawn: window.__drawn }));
  ok("reduced motion: maps still grow, with no pop-in animation", st.drawn > 2 && st.pops.every((a) => a === "none"), `${st.drawn} redraws, ${st.pops.length} new nodes, anim=${[...new Set(st.pops)].join("/") || "none"}`); }

ok("no page or console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await b.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
