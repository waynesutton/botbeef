// E2E: model scoreboard. Per-call AI Gateway logging (aiCalls) + per-game model results (modelGames) roll up every
// minute into modelDaily; public models.board returns aggregates only; Leaderboard "Models" tab renders trading
// cards with bars (SVG line icons, no emoji), deep link ?tab=models, flat header unchanged, /bots links to it,
// and the "i" model sheet shows win rate + speed. Screenshots desktop + mobile to share/models-board.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const CLOUD = S.replace(".convex.site", ".convex.cloud");
const OUT = "/workspace/agent-battle/share/models-board"; mkdirSync(OUT, { recursive: true });
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMOJI = /\p{Extended_Pictographic}/u;
const c = new ConvexHttpClient(CLOUD);

// ---------- backend: shape + privacy ----------
const b0 = await c.query(api.models.board, {});
ok("board returns days/totals/models/crew", b0 && b0.days === 30 && Array.isArray(b0.models) && Array.isArray(b0.crew) && typeof b0.totals.calls === "number");
const raw = JSON.stringify(b0);
ok("board exposes no ids, prompts, player text or keys", !/"_id"|gameId|prompt|"text"|secret|apiKey|sk-|Bearer|"name":"Load|player/i.test(raw.replace(/"name":"(Grok Bot|Muse|Dotty|Sparkle|Deepy|Clawd|Kimmy|Hermy|Hunch|Zozo|Townsy|Pinchy|Bolt)"/g, "")));
ok("every model row has label, provider, at least one bot", b0.models.every((m) => m.label && m.provider && m.bots.length > 0));
ok("crew lists Jev scoring and the verdict announcer", b0.crew.some((x) => x.role === "judge" && x.model === "typesafe/jev-1.13") && b0.crew.some((x) => x.role === "announcer"));
ok("7-day window works", (await c.query(api.models.board, { days: 7 })).days === 7);
let bad = null; try { await c.query(api.models.board, { days: 3 }); } catch (e) { bad = e; } ok("other windows rejected by the validator", !!bad);

// ---------- a real AI-vs-AI game lands on the board ----------
const before = b0.models.find((m) => m.model === "openai/gpt-5.4-nano");
const r = await c.mutation(api.games.start, { secret: randomBytes(24).toString("base64url"), name: "Board Check", mode: "exhibition", characterId: "dotty", opponentId: "sparkle", roundMs: 15000 });
ok("exhibition started", !!r?.slug);
let v; for (const t0 = Date.now(); Date.now() - t0 < 150000; await sleep(1500)) { v = await c.query(api.games.view, { slug: r.slug }); if (["finished", "no_contest", "ended"].includes(v?.status)) break; }
ok("exhibition finished", v?.status === "finished", v?.status);
let b1; for (const t0 = Date.now(); Date.now() - t0 < 150000; await sleep(5000)) {
  b1 = await c.query(api.models.board, {}); const m = b1.models.find((x) => x.model === "openai/gpt-5.4-nano");
  if (m && m.games > (before?.games ?? 0) && m.calls > (before?.calls ?? 0) && b1.crew.find((x) => x.role === "judge").calls > b0.crew.find((x) => x.role === "judge").calls) break;
}
const nano = b1.models.find((x) => x.model === "openai/gpt-5.4-nano"), flash = b1.models.find((x) => x.model === "google/gemini-3.5-flash-lite");
ok("rollup counted the game for both models", nano.games === (before?.games ?? 0) + 1 && flash.games >= 1, `${before?.games}->${nano.games}`);
ok("bot calls timed (avg response; first word only for streamed refreshes)", nano.calls > (before?.calls ?? 0) && nano.avgMs > 0 && (nano.ttftMs == null || nano.ttftMs > 0), `${nano.calls} calls ${nano.avgMs}ms ttft ${nano.ttftMs}`);
ok("Jev scoring calls logged under the judge role", b1.crew.find((x) => x.role === "judge").calls > b0.crew.find((x) => x.role === "judge").calls);
ok("verdict calls logged separately from Dotty's bot stats", b1.crew.find((x) => x.role === "announcer").calls > b0.crew.find((x) => x.role === "announcer").calls);
ok("win rate, Jev score and error rate are sane", b1.models.filter((m) => m.games).every((m) => m.winPct >= 0 && m.winPct <= 100 && m.avgScore >= 0 && m.avgScore <= 100 && (m.errorRate == null || (m.errorRate >= 0 && m.errorRate <= 100))));

// ---------- UI ----------
const br = await chromium.launch();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
for (const [tag, vp] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
  const ctx = await br.newContext({ viewport: vp, userAgent: UA, ...(tag === "mobile" ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  const P = await ctx.newPage(); P.on("pageerror", (e) => errors.push(String(e)));
  await P.goto(S + "/leaderboard");
  const nav = await P.locator(".nav-r > *").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.textContent.trim() || e.getAttribute("aria-label")));
  ok(`${tag}: header unchanged and flat (no Models item)`, !nav.includes("Models") && nav.includes("Leaderboard") && await P.locator(".nav").evaluate((e) => e.getBoundingClientRect().height < 70), JSON.stringify(nav));
  const tabs = await P.locator(".lb .tab").allInnerTexts();
  ok(`${tag}: Models tab sits next to the other leaderboard tabs`, tabs.join("|") === "Players|Which AI wins?|Models|Recent battles", tabs.join("|"));
  await P.click(".lb .tab[data-tab=models]");
  ok(`${tag}: tab updates the URL to ?tab=models`, /\?tab=models$/.test(P.url()));
  await P.waitForSelector(".mcard", { timeout: 20000 });
  const cards = await P.locator(".mcard").evaluateAll((els) => els.map((e) => ({ m: e.dataset.model, bars: e.querySelectorAll(".mb-bar").length, fills: [...e.querySelectorAll(".mb-fill")].map((f) => parseFloat(f.style.width)), av: e.querySelectorAll(".mc-bots .av").length, win: e.querySelector(".mc-big b")?.textContent })));
  ok(`${tag}: one trading card per model with games`, cards.length === b1.models.filter((m) => m.games).length, cards.length);
  ok(`${tag}: each card has 3 bars, bot avatars and a win rate`, cards.every((x) => x.bars === 3 && x.av >= 1 && /%$/.test(x.win)));
  ok(`${tag}: top card wears the trophy`, await P.locator(".mcard.top .mc-rank svg[data-icon=trophy]").count() === 1);
  ok(`${tag}: icons are SVG line icons`, await P.locator(".mboard svg").count() > cards.length * 5);
  ok(`${tag}: no emoji on the board`, !EMOJI.test(await P.locator(".mboard").innerText()));
  ok(`${tag}: crew section shows Jev and the announcer`, /Jev scoring/.test(await P.locator(".mcrew").innerText()) && /Verdict announcer/.test(await P.locator(".mcrew").innerText()));
  ok(`${tag}: no horizontal overflow`, await P.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag}: cards ${tag === "mobile" ? "stack in one column" : "sit in a grid"}`, await P.locator(".mcards").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length) === (tag === "mobile" ? 1 : 3) || (tag === "desktop" && await P.locator(".mcards").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length) >= 2));
  await P.click(".mboard .seg button:has-text('7 days')"); await sleep(1200);
  ok(`${tag}: 7-day toggle re-renders`, await P.locator(".mboard .seg .on").innerText() === "7 days" && (await P.locator(".mcard, .mb-empty").count()) > 0);
  await P.click(".mboard .seg button:has-text('30 days')"); await P.waitForSelector(".mcard");
  await sleep(800);
  await P.screenshot({ path: `${OUT}/board-${tag}.png` });
  await P.screenshot({ path: `${OUT}/board-${tag}-page.png`, fullPage: true });
  // Deep link
  const D = await ctx.newPage(); await D.goto(S + "/leaderboard?tab=models");
  ok(`${tag}: deep link opens the Models tab`, await D.locator(".lb .tab.on").innerText() === "Models" && await D.locator(".mcard").first().waitFor({ timeout: 20000 }).then(() => true, () => false));
  await D.close();
  if (tag === "mobile") {
    await P.goto(S + "/bots");
    const a = P.locator(".bots-gw a[href='/leaderboard?tab=models']");
    ok("/bots links to the model scoreboard", await a.count() === 1);
    await a.click(); await P.waitForURL(/tab=models/); ok("link lands on the Models tab", await P.locator(".lb .tab.on").innerText() === "Models");
  }
  // /bots: "How Bot Battle works" at the bottom (plain-language steps + dev notes)
  await P.goto(S + "/bots");
  const how = P.locator("section.how-works");
  await how.waitFor({ timeout: 15000 });
  ok(`${tag}: How it works is the last section on /bots`, await P.evaluate(() => { const h = document.querySelector(".how-works"); return !!h && h === h.parentElement.lastElementChild && !!document.querySelector(".bots-gw") && document.querySelector(".bots-gw").compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING; }));
  ok(`${tag}: heading reads "How Bot Battle works"`, (await how.locator("h2").innerText()) === "How Bot Battle works");
  const steps = await how.locator(".how-step h3").allInnerTexts();
  ok(`${tag}: covers battle, lock-in, judging, model swap, questions, scoreboard`, ["A battle", "Lock-in", "How Jev judges", "Swapping", "Where questions", "model scoreboard"].every((k) => steps.some((t) => t.includes(k))), steps.join(" | "));
  const plain = await how.locator(".how-plain").innerText();
  ok(`${tag}: real Jev weights (fit 50, creativity 30, clarity 20) and Pele 15%`, /50%\s*Fit/.test(plain) && /30%\s*Creativity/.test(plain) && /20%\s*Clarity/.test(plain) && /15% of the score comes from structure/.test(plain) && /85%/.test(plain));
  ok(`${tag}: real limits (15/30/45 s, 1.5 s ticks, 280 chars, 55% tie-break)`, /15, 30, 45 seconds/.test(plain) && /every 1\.5 seconds/.test(plain) && /280 characters/.test(plain) && /55% sure/.test(plain));
  ok(`${tag}: says no player text is used for training`, /trains no models/.test(plain));
  ok(`${tag}: scoreboard step links to the Models tab`, await how.locator(".how-plain a[href='/leaderboard?tab=models']").count() === 1);
  const dev = how.locator("details.how-dev");
  const open0 = await dev.evaluate((d) => d.open);
  ok(`${tag}: dev notes ${tag === "mobile" ? "start collapsed" : "open as a second column"}`, tag === "mobile" ? !open0 : open0 && await P.locator(".how-cols").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length === 2));
  if (!open0) { await dev.locator("summary").click(); ok("mobile: dev notes expand on tap", await dev.evaluate((d) => d.open)); }
  const devT = await dev.innerText();
  ok(`${tag}: dev notes cover Convex-only stack, real-time, write conflicts, logging`, ["workpool", "presence", "crons", "static-hosting", "Real-time sync", "Write-conflict safe", "Per-call logging", "Jev"].every((k) => devT.includes(k)));
  const ext = await dev.locator("a").evaluateAll((as) => as.map((a) => ({ h: a.href, t: a.target, r: a.rel })));
  ok(`${tag}: links to AI Gateway docs and TypeSafe docs, new tab + noopener`, ["https://docs.convex.dev/ai-gateway/overview", "https://docs.typesafe.ai/"].every((h) => ext.some((x) => x.h === h && x.t === "_blank" && /noopener/.test(x.r))), JSON.stringify(ext));
  ok(`${tag}: section icons are SVG line icons, no emoji`, await how.locator("svg").count() >= 12 && !EMOJI.test(await how.innerText()));
  ok(`${tag}: /bots has no horizontal overflow`, await P.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await how.scrollIntoViewIfNeeded(); await sleep(400);
  await how.screenshot({ path: `${OUT}/how-${tag}.png` });
  await P.screenshot({ path: `${OUT}/how-${tag}-view.png` });

  // Model sheet ("i") shows win rate + speed for models with games
  await P.goto(S + "/"); await P.fill("#nm", "Board Mo"); await P.click("button.mode:has-text('Solo')");
  await P.locator(".char-w:has(button.char[data-id=dotty]) .ci").click();
  const sheet = P.locator(".msh[role=dialog]"); await sheet.waitFor();
  await P.waitForSelector(".msh-o[data-model='openai/gpt-5.4-nano'] [data-stat]", { timeout: 15000 }).catch(() => {});
  const st = await sheet.locator(".msh-o[data-model='openai/gpt-5.4-nano'] [data-stat]").innerText().catch(() => "");
  ok(`${tag}: model sheet shows win rate and speed`, /\d+% wins/.test(st) && /(ms|s)\b/.test(st) && (await sheet.locator(".msh-o[data-model='openai/gpt-5.4-nano'] [data-stat] svg").count()) === 2, st.replace(/\s+/g, " "));
  ok(`${tag}: sheet rows still fit (no overflow)`, await sheet.locator(".msh-list").evaluate((l) => [...l.querySelectorAll(".msh-o")].every((r) => r.scrollWidth <= r.clientWidth + 1)));
  await sheet.screenshot({ path: `${OUT}/sheet-${tag}.png` });
  await ctx.close();
}
await br.close();
ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
const pass = results.filter((x) => x.pass).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
