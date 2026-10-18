// E2E: live viewer count via Convex Presence across contexts; crawlers/bots don't count; badge on watch + embed.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const slug = (await (await fetch(`${S}/sitemap.xml`)).text()).match(/\/g\/([0-9A-Za-z]{10})</)[1];
const b = await chromium.launch();
const mk = async (opts = {}) => { const c = await b.newContext({ userAgent: CHROME, viewport: { width: 1100, height: 800 }, ...opts }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return { c, p }; };
const count = (p) => p.locator(".watching b").first().textContent({ timeout: 15000 }).then((t) => parseInt(t ?? "0"));
const waitCount = async (p, n, ms = 20000) => { const t = Date.now(); let c = -1; while (Date.now() - t < ms) { c = await count(p).catch(() => -1); if (c === n) return c; await p.waitForTimeout(500); } return c; };

const A = await mk();
await A.p.goto(`${S}/g/${slug}`); await A.p.waitForSelector(".watching");
const base = await waitCount(A.p, 1, 8000);
ok("watch page shows viewer badge", base >= 1, `${base} watching`);
const B = await mk({ viewport: { width: 640, height: 480 } });
await B.p.goto(`${S}/g/${slug}?embed=1`); await B.p.waitForSelector(".watching");
ok("embed shows viewer badge", true);
const two = await waitCount(A.p, base + 1);
ok("second viewer (embed) bumps count live in first context", two === base + 1, `${base} -> ${two}`);
ok("embed sees the same count", (await waitCount(B.p, base + 1)) === base + 1);
await A.p.locator(".watching").screenshot({ path: `${OUT}/29-viewer-badge.png` });
await A.p.screenshot({ path: `${OUT}/30-viewer-badge-watch-page.png` });
await B.p.screenshot({ path: `${OUT}/31-viewer-badge-embed.png` });
// Bots/crawlers render no badge and send no heartbeat.
const Bot = await mk({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
await Bot.p.goto(`${S}/g/${slug}`); await Bot.p.waitForSelector(".game"); await Bot.p.waitForTimeout(4000);
ok("crawler UA renders no badge", (await Bot.p.locator(".watching").count()) === 0);
ok("crawler doesn't add to count", (await count(A.p)) === base + 1, String(await count(A.p)));
// Leaving: closing the tab sends a disconnect beacon.
await B.p.close({ runBeforeUnload: true });
const back = await waitCount(A.p, base, 40000);
ok("count drops when a viewer leaves", back === base, `${base + 1} -> ${back}`);
await b.close();
const fails = results.filter((r) => !r.pass);
console.log(JSON.stringify({ slug, pass: results.length - fails.length, total: results.length, errors: errors.slice(0, 5) }));
