// E2E: selectable game length (15/30/45 s, default 30), server validation, scaled timer, labels and share copy.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
import { randomBytes } from "node:crypto";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const cx = new ConvexHttpClient(S.replace(".convex.site", ".convex.cloud"));
const b = await chromium.launch();
const mk = async (vp) => { const c = await b.newContext({ viewport: vp, userAgent: CHROME }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };

// Server validation
const bad = await cx.mutation(api.games.start, { secret: randomBytes(32).toString("base64url"), name: "Len Tester", mode: "duel", roundMs: 20000 }).then(() => "ok", (e) => String(e.data ?? e.message));
ok("server rejects a 20 s game", /15, 30 or 45/.test(bad), bad);
const old = (await cx.query(api.leaderboard.recent, {})).at(-1);
if (old) ok("older games still report their stored/legacy length", [15000, 30000, 45000].includes((await cx.query(api.games.view, { slug: old.slug })).roundMs));

// Default 30 s via the UI (solo)
const P = await mk({ width: 390, height: 780 });
await P.goto(S + "/"); await P.waitForSelector(".seg");
const segs = await P.locator(".seg button").allTextContents();
ok("length control offers 15s/30s/45s", segs.join() === "15s,30s,45s", segs.join());
ok("default is 30 s", (await P.locator('.seg button[aria-checked="true"]').textContent()) === "30s" && /Start 30s battle/.test(await P.locator("button.btn.big").textContent()));
await P.fill("#nm", "Len Default");
await P.locator(".seg").locator("xpath=..").screenshot({ path: `${OUT}/40-length-control-mobile.png` });
await P.click("button.mode:has-text('Solo')"); await P.click("button.btn.big");
await P.waitForURL(/\/play\//); const s30 = P.url().split("/").pop();
await P.waitForSelector("#draft:not([disabled])", { timeout: 20000 });
let v = await cx.query(api.games.view, { slug: s30 });
ok("default game stored as 30 s with a 30 s clock", v.roundMs === 30000 && v.endsAt - v.startsAt === 30000, `${v.roundMs} ${v.endsAt - v.startsAt}`);
ok("live stage shows 30s", /30s/.test(await P.locator(".stage-chal span").first().textContent()));
const t = parseInt(await P.locator(".strip .timer b").textContent());
ok("timer counts from ≤30", t <= 30 && t >= 20, String(t));
await P.type("#draft", "Be dramatic and use one pun.", { delay: 40 });
const W = await mk({ width: 1100, height: 800 });
await W.goto(`${S}/g/${s30}`); await W.waitForSelector(".chal-k");
ok("watch page shows '30-second battle'", /30-second battle/.test(await W.locator(".chal-k").textContent()));
const x30 = new URL(await W.locator(".sharebar .play-x").getAttribute("href")).searchParams.get("text");
ok("live share copy says 30-second battle", /30-second battle/.test(x30), x30);

// 15 s via the UI (You vs Agent, desktop)
const D = await mk({ width: 1280, height: 860 });
await D.goto(S + "/"); await D.fill("#nm", "Len Fifteen");
await D.click("button.mode:has-text('You vs Agent')"); await D.click(".seg button:has-text('15s')");
ok("picking 15s updates Start", /Start 15s battle/.test(await D.locator("button.btn.big").textContent()));
await D.locator(".seg").locator("xpath=..").screenshot({ path: `${OUT}/41-length-control-desktop-15s.png` });
await D.click("button.btn.big"); await D.waitForURL(/\/play\//); const s15 = D.url().split("/").pop();
await D.waitForSelector("#draft:not([disabled])", { timeout: 20000 });
v = await cx.query(api.games.view, { slug: s15 });
ok("15 s game stored and clocked at 15 s", v.roundMs === 15000 && v.endsAt - v.startsAt === 15000, `${v.roundMs} ${v.endsAt - v.startsAt}`);
await D.type("#draft", "Dear plant, I am so sorry. I promise daily water and a sunny window.", { delay: 30 });
await D.screenshot({ path: `${OUT}/42-15s-typing-desktop.png` });
const t0 = Date.now();
await D.waitForSelector(".reveal", { timeout: 45000 });
ok("15 s game ends on its own clock", Date.now() - t0 < 30000, `${((Date.now() - t0) / 1000).toFixed(1)}s after typing`);
v = await cx.query(api.games.view, { slug: s15 });
const live = Math.max(...v.corners.map((c) => c.history.filter((h) => h.t < v.endsAt).length));
ok("Jev live ticks capped for 15 s (≤ 10 + final)", live <= 11, `${live} live scores`);
ok("reveal shows '15-second battle'", /15-second battle/i.test(await D.locator(".reveal .len-tag").textContent()));
const x15 = new URL(await D.locator(".reveal .play-x").getAttribute("href")).searchParams.get("text");
ok("reveal share copy says 15-second battle", /15-second battle/.test(x15), x15);
await D.screenshot({ path: `${OUT}/43-15s-reveal-desktop.png` });
const og = await (await fetch(`${S}/g/${s15}`)).text();
ok("game meta description names the length", /15-second battle/.test(og.match(/name="description" content="([^"]*)"/)?.[1] ?? ""));
await P.waitForSelector(".reveal", { timeout: 60000 });
ok("30 s game finishes", true, s30);
await b.close();
const fails = results.filter((r) => !r.pass);
console.log(JSON.stringify({ s30, s15, pass: results.length - fails.length, total: results.length, errors: errors.slice(0, 5) }));
