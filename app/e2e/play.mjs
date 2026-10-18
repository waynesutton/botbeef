// E2E on the deployed URL: solo game start to finish, a second-context spectator, HvA with early lock-in, leaderboard update.
import { chromium, devices } from "/tmp/pw/node_modules/playwright/index.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share";
const results = []; const errors = [];
const imgs = (p) => p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
// Every battle element must sit fully inside the visible viewport, and the stage must not need scrolling.
const fits = (p) => p.evaluate(() => {
  const vh = window.visualViewport?.height ?? innerHeight, vw = innerWidth;
  const sel = [".strip .s0 .av", ".strip .s1 .av", ".tug", ".strip .timer", ".la0 .la-t", ".la1 .la-t", "#draft", ".composer button.btn"];
  const bad = sel.filter((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return !r || r.height < 8 || r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1; });
  const st = document.querySelector(".stage");
  return { bad, stageFits: !!st && st.scrollHeight <= st.clientHeight + 1, pageScroll: document.scrollingElement.scrollHeight - innerHeight, vh };
});
// Counts any emoji/text pop (+N, ooh, sparks, mood emoji) and the 2D motion layers (nod/hop/lunge/recoil) that replace them.
const watchPops = (p) => p.evaluate(() => {
  window.__pops = 0; window.__motion = new Set();
  const bad = (n) => n.nodeType === 1 && (n.matches?.(".pop, .ooh, .hitspark, .av-emoji, [class*=float]") || (n.closest?.(".av, .hitwrap") && /\p{Extended_Pictographic}|^[+−-]\d/u.test(n.textContent ?? "")));
  const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (bad(n)) window.__pops++;
    for (const c of ["nod", "hop", "glance"]) if (n.classList?.contains(c) || n.querySelector?.(`.${c}`)) window.__motion.add(c);
    if (n.classList && /lunge|recoil/.test(n.className)) window.__motion.add("hit");
  })));
  mo.observe(document.body, { subtree: true, childList: true });
  // live puppets: record every move they play (data-move / data-last on .pp)
  new MutationObserver((ms) => ms.forEach((m) => { const v = m.target.getAttribute?.(m.attributeName); if (v && m.target.classList?.contains("pp")) window.__motion.add("pup:" + v); }))
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-move", "data-last"] });
});
// Parse an X share intent: must be twitter.com/intent/tweet (universal link), a plain _blank anchor, exact share URL, properly encoded copy.
const intent = async (p, sel) => {
  const a = p.locator(sel).first(); const h = await a.getAttribute("href").catch(() => null); if (!h) return {};
  const u = new URL(h), target = await a.getAttribute("target"), rel = await a.getAttribute("rel") ?? "", onclick = await a.getAttribute("onclick");
  const encoded = !/[ #🥩🎤]/u.test(h.split("?")[1] ?? "") && [...u.searchParams.keys()].join() === "text,url";
  return { ok: u.origin === "https://twitter.com" && u.pathname === "/intent/tweet" && target === "_blank" && rel.includes("noopener") && !onclick && encoded, url: u.searchParams.get("url"), text: u.searchParams.get("text") ?? "" };
};
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond, extra }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const mk = async (opts) => { const c = await b.newContext({ userAgent: CHROME, ...opts }); const p = await c.newPage(); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); p.on("pageerror", (e) => errors.push(String(e))); return { c, p }; };

// Home, light + dark, mobile + desktop
const phone = await mk({ ...devices["iPhone 13"], colorScheme: "light" });
await phone.p.goto(S + "/"); await phone.p.waitForSelector("text=Who's got bars?");
await imgs(phone.p); await phone.p.screenshot({ path: `${OUT}/01-home-mobile-light.png`, fullPage: true });
let x = await intent(phone.p, "footer .foot-x");
ok("no app-store smart banner / custom schemes on the page", (await phone.p.locator('meta[name="apple-itunes-app"], meta[name="google-play-app"], a[href^="twitter:"], a[href^="x:"]').count()) === 0);
ok("footer Share on X -> compose intent with /in-tweet card", x.ok && x.url === `${S}/in-tweet` && x.text.length > 10, x.text);
await phone.p.locator("footer").screenshot({ path: `${OUT}/26-footer-share-on-x.png` });
const desk = await mk({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" });
await desk.p.goto(S + "/"); await desk.p.waitForSelector("text=Who's got bars?");
await imgs(desk.p); await desk.p.screenshot({ path: `${OUT}/02-home-desktop-dark.png`, fullPage: true });

// Solo game on the phone
const P = phone.p;
await P.fill("#nm", "E2E Wayne");
await P.click("button.mode:has-text('Solo')");
await P.click("button.char:has-text('Grokbot')");
await P.click("button.btn.big");
await P.waitForURL(/\/play\/[0-9A-Za-z]{10}$/, { timeout: 15000 });
const slug = P.url().split("/").pop();
ok("solo game created with its own slug", /^[0-9A-Za-z]{10}$/.test(slug), slug);
// Spectator in a second context (no seat)
const spec = await mk({ viewport: { width: 1280, height: 860 }, colorScheme: "light" });
await spec.p.goto(`${S}/g/${slug}`);
await P.waitForSelector("#draft:not([disabled])", { timeout: 20000 });
ok("countdown -> live, composer enabled", true);
await watchPops(P);
ok("spectator has no composer", (await spec.p.locator("#draft").count()) === 0);
const prompt = "Be wildly dramatic and funny. Use one clever pun, mention specific details, keep it tight, and finish with a confident mic drop line.";
await P.type("#draft", prompt, { delay: 90 });
await P.waitForTimeout(4000);
await imgs(P); await P.screenshot({ path: `${OUT}/03-solo-live-mobile.png`, fullPage: true });
await P.screenshot({ path: `${OUT}/20-mobile-typing-light.png` });
x = await intent(P, ".stage-foot .play-x");
ok("live stage Play on X -> this game's /g link", x.ok && x.url === `${S}/g/${slug}` && /vs .* Watch live/i.test(x.text), x.text);
x = await intent(spec.p, ".sharebar .play-x");
ok("watch page Play on X -> this game's /g link", x.ok && x.url === `${S}/g/${slug}` && /watch live/i.test(x.text), x.text);
ok("copy watch link still on watch page", (await spec.p.locator("button:has-text('Copy watch link')").count()) === 1);
let f = await fits(P);
ok("mobile typing: avatars, score, timer, answers, input all on screen", !f.bad.length && f.stageFits, JSON.stringify(f));
{ const q = await P.evaluate(() => { const p = document.querySelector(".stage .stage-q > .stage-chal"); return { t: p?.querySelector(".sq-t")?.textContent ?? "", k: p?.querySelector(".sq-k")?.textContent ?? "", clamped: p ? p.scrollHeight > p.clientHeight + 1 : true }; });
  ok("mobile typing: full labelled question, not truncated", q.t.length > 5 && !q.clamped && /^(Challenge|Question):$/.test(q.k), `${q.k} ${q.t}`);
  const lb = await P.locator(".composer button.btn").boundingBox(), wb = await P.locator(".stage-foot .watching").boundingBox(), xb = await P.locator(".stage-foot .play-x").boundingBox();
  ok("mobile typing: watching + Play on X below the input", lb && wb && xb && wb.y >= lb.y + lb.height - 1 && xb.y >= lb.y + lb.height - 1); }
// Simulated soft keyboard: the visual viewport shrinks to ~400px.
await P.setViewportSize({ width: 390, height: 400 }); await P.focus("#draft"); await P.type("#draft", " Also rhyme.", { delay: 60 }); await P.waitForTimeout(1200);
await P.screenshot({ path: `${OUT}/21-mobile-typing-keyboard-light.png` });
f = await fits(P);
ok("keyboard open (390x400): battle strip + input still visible", !f.bad.length && f.stageFits, JSON.stringify(f));
const theme = await P.evaluate(() => document.documentElement.getAttribute("data-theme"));
await P.evaluate(() => document.documentElement.setAttribute("data-theme", "dark")); await P.waitForTimeout(300);
await P.screenshot({ path: `${OUT}/22-mobile-typing-keyboard-dark.png` });
await P.evaluate((t) => t ? document.documentElement.setAttribute("data-theme", t) : document.documentElement.removeAttribute("data-theme"), theme);
await P.setViewportSize({ width: 390, height: 664 });
ok("no emoji flashes, +N/−N pops, 'ooh' text or sparks while typing", await P.evaluate(() => window.__pops === 0) && (await P.locator(".pop, .ooh, .hitspark").count()) === 0, String(await P.evaluate(() => window.__pops)));
const motion = await P.evaluate(() => [...window.__motion]);
ok("characters themselves move with typing/score (puppet type + nod, plus kick/jump/hit/dance)", motion.includes("pup:type") && motion.includes("pup:nod") && motion.filter((m) => m.startsWith("pup:")).length >= 3, motion.join(","));
ok("strip shows full-body art for both bots", (await P.locator('.strip .av.full img[src$=".full.v1.webp"]').count()) === 2);
ok("strip bots are live 2D puppets", (await P.locator(".strip .av.pup .pp .pp-s").count()) >= 12);
ok("no 3D: no canvas, no three.js chunk", (await P.locator("canvas").count()) === 0 && !(await P.evaluate(() => performance.getEntriesByType("resource").some((r) => /World-|three|\.glb/.test(r.name)))));
await imgs(spec.p); await spec.p.screenshot({ path: `${OUT}/04-solo-watch-desktop.png`, fullPage: true });
const specText = await spec.p.locator(".prompt").first().textContent().catch(() => "");
ok("spectator sees the coach prompt live (solo policy)", (specText ?? "").includes("dramatic"), (specText ?? "").slice(0, 40));
const nums = await spec.p.locator(".meter-num").allTextContents();
ok("spectator sees live scores", nums.length === 2 && nums.some((n) => parseInt(n) > 0), nums.join(" vs "));
const ans = await spec.p.locator(".f0 .bubble").textContent();
ok("agent answer refreshed from prompt", (ans ?? "").length > 20 && !/Waiting/.test(ans ?? ""), (ans ?? "").slice(0, 50));
// Let the clock run out (server-authoritative)
await P.waitForSelector(".reveal", { timeout: 80000 });
await spec.p.waitForSelector(".reveal", { timeout: 20000 });
const head = await P.locator(".win").textContent();
ok("reveal shows a winner/draw", /wins!|draw/.test(head ?? ""), head);
ok("reveal shows full-body art with win/lose poses", (await P.locator('.arena .av.full img[src$=".full.v1.webp"]').count()) === 2 && (await P.locator(".arena .av.mood-win, .arena .av.mood-lose, .arena .av.mood-focused").count()) === 2);
await P.waitForTimeout(2200);
const endMoves = await P.locator(".arena .av .pp").evaluateAll((es) => es.map((e) => e.dataset.move));
ok("reveal puppets: winner victory lap, loser slumps (sad) after the lose move", (endMoves.includes("victory") && endMoves.includes("sad")) || endMoves.every((m) => m === "idle"), endMoves.join(","));
await imgs(P); await P.screenshot({ path: `${OUT}/05-solo-reveal-mobile.png`, fullPage: true });
await imgs(spec.p); await spec.p.screenshot({ path: `${OUT}/06-solo-reveal-watch.png`, fullPage: true });
ok("spectator has no Rematch", (await spec.p.locator("button:has-text('Rematch')").count()) === 0);
ok("host has Rematch", (await P.locator("button:has-text('Rematch')").count()) === 1);
x = await intent(P, ".reveal .play-x");
ok("reveal Play on X -> /g link + replay copy", x.ok && x.url === `${S}/g/${slug}` && /\d+–\d+ in a \d+-second battle on Bot Battle.*replay/.test(x.text), x.text);
x = await intent(spec.p, ".reveal .play-x");
ok("watch-page reveal Play on X", x.ok && x.url === `${S}/g/${slug}`, x.text);
ok("reveal keeps Copy link", (await P.locator(".reveal button:has-text('Copy link')").count()) === 1);

// Embed (X player card frame 640x480)
const emb = await mk({ viewport: { width: 640, height: 480 } });
await emb.p.goto(`${S}/g/${slug}?embed=1`); await emb.p.waitForSelector(".reveal");
await imgs(emb.p); await emb.p.screenshot({ path: `${OUT}/07-in-tweet-embed-640x480.png` });
ok("embed has no nav", (await emb.p.locator("nav.nav").count()) === 0);
await emb.p.goto(`${S}/in-tweet`); await emb.p.waitForSelector("text=Who's got bars?");
await imgs(emb.p); await emb.p.screenshot({ path: `${OUT}/08-in-tweet-home-640x480.png` });

// Human vs Agent with early lock-in (desktop, dark)
const D = desk.p;
await D.goto(S + "/");
await D.fill("#nm", "E2E Typist");
await D.click("button.mode:has-text('You vs Agent')");
await D.click("button.btn.big");
await D.waitForURL(/\/play\//);
const slug2 = D.url().split("/").pop();
await D.waitForSelector("#draft:not([disabled])", { timeout: 20000 });
await D.type("#draft", "Dear router, it's not me, it's you. Three bars of love, then nothing. I'm switching to ethernet. Don't call, you can't connect anyway.", { delay: 40 });
await D.waitForTimeout(2500);
await imgs(D); await D.screenshot({ path: `${OUT}/09-hva-live-desktop-dark.png`, fullPage: true });
await D.screenshot({ path: `${OUT}/23-desktop-typing-dark.png` });
f = await fits(D);
ok("desktop typing: side-by-side arena + input, no scrolling", !f.bad.length && f.stageFits && f.pageScroll <= 0, JSON.stringify(f));
await D.setViewportSize({ width: 1440, height: 760 }); await D.waitForTimeout(300);
f = await fits(D);
ok("desktop typing at 1440x760 fits", !f.bad.length && f.stageFits, JSON.stringify(f));
await D.setViewportSize({ width: 1280, height: 860 });
await D.click("button:has-text('Lock in')");
const t0 = Date.now();
await D.waitForSelector(".reveal", { timeout: 60000 });
ok("hva lock-in closes early", Date.now() - t0 < 30000, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
await imgs(D); await D.screenshot({ path: `${OUT}/10-hva-reveal-desktop-dark.png`, fullPage: true });

// Leaderboard updated after finish
await spec.p.goto(`${S}/leaderboard`);
await spec.p.click("button.tab:has-text('Recent battles')");
await spec.p.waitForSelector(".recent-a", { timeout: 10000 });
const hrefs = await spec.p.locator(".recent-a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
ok("leaderboard recent lists the solo game", hrefs.includes(`/g/${slug}`));
ok("leaderboard recent lists the hva game", hrefs.includes(`/g/${slug2}`));
await imgs(spec.p); await spec.p.screenshot({ path: `${OUT}/11-leaderboard-recent.png`, fullPage: true });
await spec.p.click("button.tab:has-text('Which AI wins?')");
await spec.p.waitForSelector(".lb-row.agent");
const g = await spec.p.locator(".lb-row.agent .rec").allTextContents();
ok("agent stats updated", g.some((t) => /^[1-9]|-[1-9]|-\d+-[1-9]/.test(t) && !t.startsWith("0-0-0")), g.slice(0, 2).join(" | "));
await imgs(spec.p); await spec.p.screenshot({ path: `${OUT}/12-leaderboard-agents.png`, fullPage: true });
await P.goto(`${S}/leaderboard`); await P.waitForSelector(".mystats");
ok("player stats show on leaderboard", /E2E Wayne#/.test(await P.locator(".mystats").textContent()));
await imgs(P); await P.screenshot({ path: `${OUT}/13-leaderboard-players-mobile.png`, fullPage: true });

// Bad slug
await spec.p.goto(`${S}/g/zzzzzzzzzz`); await spec.p.waitForSelector("text=No battle here.");
ok("unknown game shows not found", true);
await b.close();
const fails = results.filter((r) => !r.pass);
console.log(JSON.stringify({ slug, slug2, pass: results.length - fails.length, total: results.length, consoleErrors: errors.slice(0, 10) }, null, 1));
