// E2E: /in-tweet, the published X player card URL. Twitterbot still sees one player card (https player URL, 640x480,
// poster image, no stream); framing is allowed only for x.com/twitter.com; inside a sandboxed iframe on a stand-in
// x.com page (640x480 and 360x270) and on tap-through, users get the regular app home: header, Start a battle,
// Leaderboard (agents tab) all work in place. Screenshots in share/in-tweet.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share/in-tweet"; mkdirSync(OUT, { recursive: true });
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const EMOJI = /\p{Extended_Pictographic}/u;
const meta = (html, n) => [...html.matchAll(new RegExp(`<meta (?:name|property)="${n}" content="([^"]*)"`, "g"))].map((m) => m[1]);

// ---------- what Twitterbot sees ----------
const r = await fetch(`${S}/in-tweet`, { headers: { "user-agent": "Twitterbot/1.0" } });
const html = await r.text(), csp = r.headers.get("content-security-policy") ?? "";
ok("Twitterbot: 200 HTML", r.status === 200 && /text\/html/.test(r.headers.get("content-type")));
ok("exactly one twitter:card = player", meta(html, "twitter:card").join() === "player");
ok("twitter:player is https and points at /in-tweet", meta(html, "twitter:player").join() === `${S}/in-tweet` && S.startsWith("https://"));
ok("player size 640x480", meta(html, "twitter:player:width").join() === "640" && meta(html, "twitter:player:height").join() === "480");
ok("poster image + title + description present", meta(html, "twitter:image")[0]?.startsWith("https://") && meta(html, "twitter:title").length === 1 && meta(html, "twitter:description").length === 1);
ok("no twitter:player:stream (not a video)", meta(html, "twitter:player:stream").length === 0);
ok("poster image is served", (await fetch(meta(html, "twitter:image")[0])).status === 200);
ok("frame-ancestors allows x.com and twitter.com only", /frame-ancestors 'self' https:\/\/x\.com https:\/\/\*\.x\.com https:\/\/twitter\.com https:\/\/\*\.twitter\.com/.test(csp));
ok("no X-Frame-Options on /in-tweet", !r.headers.get("x-frame-options"));
ok("connect-src allows the live Convex websocket", /connect-src [^;]*wss:\/\/[a-z0-9-]+\.convex\.cloud/.test(csp));
const home = await fetch(`${S}/`); ok("home stays unframeable (DENY)", home.headers.get("x-frame-options") === "DENY");

// ---------- inside a sandboxed iframe on an x.com page: the regular app home ----------
const b = await chromium.launch();
const HERO = "Who's got bars?";
for (const [tag, vp, fw, fh] of [["640x480", { width: 700, height: 560 }, 640, 480], ["360x270", { width: 390, height: 320 }, 360, 270]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, ...(tag === "360x270" ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.route("https://x.com/bb-card-test", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><body style="margin:0;padding:15px;background:#000"><iframe id="card" src="${S}/in-tweet" width="${fw}" height="${fh}" style="border:1px solid #333;border-radius:16px" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms" allow="autoplay; fullscreen"></iframe></body>` }));
  const P = await ctx.newPage(); P.on("pageerror", (e) => errors.push(String(e)));
  P.on("console", (m) => { if (m.type() === "error" && /frame-ancestors|Refused/.test(m.text())) errors.push(m.text()); });
  await P.goto("https://x.com/bb-card-test");
  const F = P.frameLocator("#card");
  ok(`${tag}: frame loads the regular home UI`, await F.locator(`text=${HERO}`).waitFor({ timeout: 20000 }).then(() => true, () => false) && await F.locator("#nm").count() === 1 && await F.locator("button.mode").count() === 4);
  ok(`${tag}: regular header with Bots and Leaderboard`, await F.locator(".nav-bar .nav-r a.nav-a:has-text('Leaderboard')").getAttribute("href") === "/leaderboard?tab=agents" && await F.locator(".nav-bar .nav-r a.nav-a:has-text('Bots')").count() === 1);
  ok(`${tag}: no compact card view, no zoom`, await F.locator(".it, .it-game, .embed").count() === 0 && await F.locator("html").evaluate((h) => !h.style.zoom));
  ok(`${tag}: fits the frame width (no sideways scroll)`, await F.locator("html").evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag}: no emoji in the UI chrome`, !EMOJI.test(await F.locator(".nav-bar").innerText()));
  ok(`${tag}: header stays on one line`, await F.locator(".nav").evaluate((n) => n.getBoundingClientRect().height < 64 && n.querySelector(".logo").getBoundingClientRect().height < 40));
  await F.locator(".hero-row img, .hero-row .av").first().waitFor({ timeout: 10000 }).catch(() => {}); await P.waitForTimeout(2500);
  await P.screenshot({ path: `${OUT}/home-in-frame-${tag}.png`, clip: { x: 0, y: 0, width: fw + 30, height: fh + 30 } });
  // Leaderboard inside the frame (client-side nav, opens the agents tab)
  await F.locator(".nav-bar a.nav-a:has-text('Leaderboard')").click();
  await P.waitForTimeout(1500);
  ok(`${tag}: Leaderboard opens in the frame on the agents tab`, await F.locator(".lb .tab.on").innerText().then((t) => t === "Which AI wins?", () => false) && await F.locator(".lb-row.agent").first().waitFor({ timeout: 15000 }).then(() => true, () => false));
  await P.screenshot({ path: `${OUT}/leaderboard-in-frame-${tag}.png`, clip: { x: 0, y: 0, width: fw + 30, height: fh + 30 } });
  if (tag === "640x480") {
    // Start a battle from the framed home: it plays right there
    await F.locator(".nav-bar a").first().click();
    await F.locator("#nm").fill("Card Tester");
    await F.locator("button.mode:has-text('Exhibition')").click();
    await F.locator("button.btn.big").click();
    const frame = P.frames().find((f) => f.url().startsWith(S)) ?? P.frames()[1];
    await frame.waitForURL(/\/g\/[0-9A-Za-z]{10}/, { timeout: 20000 }).catch(() => {});
    const slug = frame.url().match(/\/g\/([0-9A-Za-z]{10})/)?.[1];
    ok("Start in the frame opens the battle in the frame (no new tab)", !!slug && ctx.pages().length === 1, frame.url());
    const api = async () => (await fetch(`${S.replace(".convex.site", ".convex.cloud")}/api/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "games:view", args: { slug }, format: "json" }) })).json();
    let st; for (let k = 0; k < 40; k++) { st = (await api()).value?.status; if (["live", "closing", "finished"].includes(st)) break; await P.waitForTimeout(1000); }
    ok("the framed battle goes live", ["live", "closing", "finished"].includes(st), st);
    await P.waitForTimeout(5000);
    ok("the framed battle shows both fighters", await F.locator(".fighter").count() === 2);
    await P.screenshot({ path: `${OUT}/battle-in-frame-640x480.png`, clip: { x: 0, y: 0, width: 670, height: 510 } });
  }
  await ctx.close();
}
// Tap-through: /in-tweet in a normal mobile browser is the same home as /
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const P = await ctx.newPage(); P.on("pageerror", (e) => errors.push(String(e)));
  await P.goto(S + "/in-tweet"); await P.waitForSelector(`text=${HERO}`);
  const a = await P.locator("main").innerText();
  await P.goto(S + "/"); await P.waitForSelector(`text=${HERO}`);
  const h = await P.locator("main").innerText();
  ok("tap-through: /in-tweet shows the same home as /", a.slice(0, 400) === h.slice(0, 400));
  await P.goto(S + "/in-tweet"); await P.waitForSelector(`text=${HERO}`); await P.waitForTimeout(2500);
  await P.screenshot({ path: `${OUT}/home-tap-through-mobile.png` });
  await ctx.close();
}
await b.close();
ok("no page errors or framing refusals", errors.length === 0, errors.slice(0, 3).join(" | "));
const pass = results.filter((x) => x.pass).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
