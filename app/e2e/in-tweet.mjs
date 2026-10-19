// E2E: /in-tweet, the published X player card URL. Twitterbot still sees one player card (https player URL, 640x480,
// poster image, no stream); framing is allowed only for x.com/twitter.com; inside a sandboxed iframe on a stand-in
// x.com page (360x270, 540x390, 640x480; scrolling=no like X's frame) users get a no-scroll launch card whose Play and
// Leaderboard buttons (and the card itself) open the full app in a new tab; a direct visit gets the regular home at /. Screenshots in share/in-tweet.
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

// ---------- inside a sandboxed, non-scrolling iframe on an x.com page: the launch card ----------
const b = await chromium.launch();
for (const [fw, fh, mobile] of [[360, 270, true], [540, 390, false], [640, 480, false]]) {
  const tag = `${fw}x${fh}`;
  const ctx = await b.newContext({ viewport: { width: fw + 40, height: fh + 60 }, deviceScaleFactor: 2, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.route("https://x.com/bb-card-test", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><body style="margin:0;padding:15px;background:#000"><iframe id="card" src="${S}/in-tweet" width="${fw}" height="${fh}" scrolling="no" style="border:1px solid #333;border-radius:16px" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms" allow="autoplay; fullscreen"></iframe></body>` }));
  const P = await ctx.newPage(); P.on("pageerror", (e) => errors.push(String(e)));
  P.on("console", (m) => { if (m.type() === "error" && /frame-ancestors|Refused/.test(m.text())) errors.push(m.text()); });
  await P.goto("https://x.com/bb-card-test");
  const F = P.frameLocator("#card");
  ok(`${tag}: frame shows the launch card`, await F.locator(".lcard").waitFor({ timeout: 20000 }).then(() => true, () => false));
  const t = await F.locator(".lcard").innerText();
  ok(`${tag}: logo, 3 bots, headline, one line of copy, Play + Leaderboard`, /Bot Battle/.test(t) && await F.locator(".lc-row .av").count() === 3 && await F.locator(".lcard h1").innerText() === "Who's got bars?" && await F.locator(".lc-sub").count() === 1 && await F.locator(".lc-btns a").allInnerTexts().then((x) => x.length === 2 && /Play/.test(x[0]) && /Leaderboard/.test(x[1])));
  ok(`${tag}: no app header or form in the frame`, await F.locator(".nav-bar, #nm, .home").count() === 0);
  const fit = await F.locator("html").evaluate(() => {
    const se = document.scrollingElement, out = [...document.querySelectorAll(".lc-top, .lc-row, .lcard h1, .lc-sub, .lc-btns a")].filter((e) => { const r = e.getBoundingClientRect(); return r.top < 0 || r.left < 0 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5; }).map((e) => e.className || e.tagName);
    const sub = document.querySelector(".lc-sub"), lh = parseFloat(getComputedStyle(sub).lineHeight) || 18;
    return { sh: se.scrollHeight, h: innerHeight, sw: se.scrollWidth, w: innerWidth, out, subLines: Math.round(sub.getBoundingClientRect().height / lh), overlap: (() => { const a = document.querySelector(".lc-top").getBoundingClientRect(), r = document.querySelector(".lc-row").getBoundingClientRect(); return a.bottom > r.top + 1; })() };
  });
  ok(`${tag}: fits with no scrolling (everything inside the frame)`, fit.sh <= fit.h + 1 && fit.sw <= fit.w + 1 && fit.out.length === 0 && !fit.overlap, JSON.stringify(fit));
  ok(`${tag}: copy is one line`, fit.subLines === 1, fit.subLines);
  const play = F.locator(".lc-btns a").nth(0), lb = F.locator(".lc-btns a").nth(1);
  ok(`${tag}: Play opens / in a new tab (noopener)`, await play.getAttribute("href") === "/" && await play.getAttribute("target") === "_blank" && /noopener/.test(await play.getAttribute("rel")));
  ok(`${tag}: Leaderboard opens /leaderboard?tab=agents in a new tab (noopener)`, await lb.getAttribute("href") === "/leaderboard?tab=agents" && await lb.getAttribute("target") === "_blank" && /noopener/.test(await lb.getAttribute("rel")));
  ok(`${tag}: no emoji`, !EMOJI.test(t));
  await F.locator(".lc-row .av").first().waitFor().catch(() => {}); await P.waitForTimeout(2500);
  await P.screenshot({ path: `${OUT}/card-${tag}.png` });
  if (fw === 540) {
    const pop = async (fn) => { const [p] = await Promise.all([ctx.waitForEvent("page", { timeout: 10000 }), fn()]); await p.waitForLoadState("domcontentloaded"); const u = p.url(); await p.close(); return u; };
    const u1 = await pop(() => F.locator(".lcard h1").click());
    ok("tapping anywhere on the card opens the app home in a new tab", u1 === `${S}/`, u1);
    const u2 = await pop(() => play.click());
    ok("Play button opens the app home in a new tab", u2 === `${S}/`, u2);
    const u3 = await pop(() => lb.click());
    ok("Leaderboard button opens the agents tab in a new tab", u3 === `${S}/leaderboard?tab=agents`, u3);
    ok("the frame itself stays on the card", await F.locator(".lcard").count() === 1);
  }
  await ctx.close();
}
// Direct visit (not framed, e.g. X mobile tap-through): the regular app home, at /
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const P = await ctx.newPage(); P.on("pageerror", (e) => errors.push(String(e)));
  await P.goto(S + "/in-tweet"); await P.waitForSelector("text=Who's got bars?");
  ok("direct visit: lands on the regular home at /", new URL(P.url()).pathname === "/" && await P.locator(".nav-bar").count() === 1 && await P.locator("#nm").count() === 1 && await P.locator(".hero").count() === 1);
  ok("direct visit: no launch card", await P.locator(".lcard, html.lcard-on").count() === 0);
  await P.waitForTimeout(2500);
  await P.screenshot({ path: `${OUT}/direct-visit-mobile.png` });
  await P.goto(S + "/"); await P.waitForSelector("text=Who's got bars?");
  ok("regular site unchanged: no launch card on /", await P.locator(".lcard, html.lcard-on").count() === 0 && await P.locator(".hero").count() === 1);
  await ctx.close();
}
await b.close();
ok("no page errors or framing refusals", errors.length === 0, errors.slice(0, 3).join(" | "));
const pass = results.filter((x) => x.pass).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
