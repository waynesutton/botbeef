// E2E: /in-tweet, the X player card. Twitterbot sees one player card (https player URL, 640x480, poster image, no
// stream), framing is allowed only for x.com/twitter.com, and inside a sandboxed 640x480 iframe on an x.com page
// (Playwright serves a stand-in x.com page) the card shows a live battle or the latest replay, and "Start a bot
// battle" runs a fresh exhibition right in the frame. Leaderboard buttons open ?tab=agents. Screenshots in share/in-tweet.
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

// ---------- inside a sandboxed iframe on an x.com page ----------
const b = await chromium.launch();
for (const [tag, vp, fw, fh] of [["desktop", { width: 900, height: 640 }, 640, 480], ["mobile", { width: 390, height: 700 }, 360, 270]]) {
  const ctx = await b.newContext({ viewport: vp, ...(tag === "mobile" ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await ctx.route("https://x.com/bb-card-test", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><body style="margin:0;padding:16px;background:#000;font:14px system-ui;color:#e7e9ea"><p>Stand-in post</p><iframe id="card" src="${S}/in-tweet" width="${fw}" height="${fh}" style="border:1px solid #333;border-radius:16px" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms" allow="autoplay; fullscreen"></iframe></body>` }));
  const P = await ctx.newPage(); P.on("pageerror", (e) => errors.push(String(e)));
  P.on("console", (m) => { if (m.type() === "error" && /frame-ancestors|Refused/.test(m.text())) errors.push(m.text()); });
  await P.goto("https://x.com/bb-card-test");
  const F = P.frameLocator("#card");
  const g = F.locator(".it-game");
  ok(`${tag}: card renders inside the x.com frame`, await F.locator(".it-bar").waitFor({ timeout: 20000 }).then(() => true, () => false));
  ok(`${tag}: card shows a battle (live or replay), not just links`, await g.waitFor({ timeout: 20000 }).then(() => true, () => false), await g.getAttribute("data-live").catch(() => ""));
  ok(`${tag}: battle view has both fighters and scores`, await F.locator(".it-game .fighter, .it-game .la, .it-game .board").first().waitFor({ timeout: 15000 }).then(() => true, () => false));
  const lb = await F.locator(".it-bar a:has-text('Leaderboard')");
  ok(`${tag}: card Leaderboard button opens ?tab=agents in a new tab`, (await lb.getAttribute("href")) === "/leaderboard?tab=agents" && (await lb.getAttribute("target")) === "_blank");
  ok(`${tag}: every Leaderboard link in the card goes to ?tab=agents`, (await F.locator("a:has-text('Leaderboard')").evaluateAll((as) => as.every((a) => a.getAttribute("href") === "/leaderboard?tab=agents"))));
  ok(`${tag}: no emoji in the card`, !EMOJI.test(await F.locator(".it").innerText()));
  await P.screenshot({ path: `${OUT}/card-${tag}-featured.png` });
  if (tag === "desktop") {
    const t0 = Date.now();
    await F.locator("button[data-act=battle]").click();
    await F.locator(".it-game[data-live=mine]").waitFor({ timeout: 20000 });
    const slug = await F.locator(".it-game[data-live=mine]").getAttribute("data-slug");
    ok("Start a bot battle starts a game in the frame (no new tab)", !!slug && ctx.pages().length === 1, slug);
    const api = async () => (await fetch(`${S.replace(".convex.site", ".convex.cloud")}/api/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "games:view", args: { slug }, format: "json" }) })).json();
    let st; for (let i = 0; i < 40; i++) { st = (await api()).value?.status; if (["live", "closing", "finished"].includes(st)) break; await P.waitForTimeout(1000); }
    ok("the in-card battle goes live", ["live", "closing", "finished"].includes(st), `${st} after ${Math.round((Date.now() - t0) / 1000)}s`);
    await P.waitForTimeout(6000);
    await P.screenshot({ path: `${OUT}/card-desktop-live.png` });
    for (let i = 0; i < 80 && st !== "finished"; i++) { await P.waitForTimeout(1500); st = (await api()).value?.status; }
    ok("the in-card battle finishes with a winner", st === "finished", st);
    await P.waitForTimeout(3000);
    ok("frame shows the result", await F.locator(".it-game").innerText().then((t) => /won|Draw|draw|wins/i.test(t)));
    await P.screenshot({ path: `${OUT}/card-desktop-finished.png` });
  }
  await ctx.close();
}
await b.close();
ok("no page errors or framing refusals", errors.length === 0, errors.slice(0, 3).join(" | "));
const pass = results.filter((x) => x.pass).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
