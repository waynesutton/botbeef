// E2E: UI chrome polish. No emoji in the chrome, line-icon theme toggle, monochrome logo with no box (auto-inverts in dark),
// monochrome favicons, and the post-game Pele map modal (zoom, drag, Esc / close).
import { randomBytes } from "node:crypto";
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const CLOUD = S.replace(".convex.site", ".convex.cloud");
const OUT = "/workspace/agent-battle/share/chrome";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const mk = async (vp = { width: 390, height: 844 }, scheme = "light", touch = true) => { const c = await b.newContext({ viewport: vp, userAgent: UA, colorScheme: scheme, hasTouch: touch, deviceScaleFactor: 2 }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); return p; };
const imgs = (p) => p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
const cx = new ConvexHttpClient(CLOUD);
const sx = () => randomBytes(32).toString("base64url");
// Emoji in UI chrome: everything except player/bot-written text (answers, drafts, prompts, verdicts, questions).
const emojiIn = (p) => p.evaluate(() => {
  const skip = ".dice,.bubble,.la-t,.prompt,.verdict,.chal-t,.stage-chal,.sq-full,#q,textarea,.pm,.pmm-in,.lb-row b,.mystats b";
  const re = /[\p{Extended_Pictographic}\u{FE0F}\u{2600}-\u{27BF}\u{2B50}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}]/u;
  const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const el = n.parentElement; if (el && !el.closest(skip) && re.test(n.textContent ?? "")) out.push(n.textContent.trim().slice(0, 40)); }
  for (const el of document.querySelectorAll("*")) for (const ps of ["::before", "::after"]) { const c = getComputedStyle(el, ps).content; if (c && c !== "none" && c !== "normal" && re.test(c)) out.push(`${el.className}${ps} ${c}`); }
  return out;
});
const boxless = (p) => p.evaluate(() => {
  const l = document.querySelector(".nav .logo"), m = l?.querySelector("svg.mark");
  const cs = (e) => getComputedStyle(e);
  const clear = (e) => { const c = cs(e); return (c.backgroundColor === "rgba(0, 0, 0, 0)" || c.backgroundColor === "transparent") && c.backgroundImage === "none" && parseFloat(c.borderTopWidth) === 0 && c.boxShadow === "none" && c.outlineStyle === "none"; };
  return { mark: !!m, img: !!l?.querySelector("img"), clear: !!m && clear(m) && clear(l), color: m ? cs(m).color : null, radius: m ? cs(m).borderRadius : null };
});

// ---------- 1. header: logo + theme toggle, light and dark ----------
const L = await mk(); await L.goto(S + "/"); await L.waitForSelector(".nav .logo"); await imgs(L);
const hl = await boxless(L);
ok("logo: inline monochrome SVG mark, no <img>", hl.mark && !hl.img);
ok("logo: no box, tile, border, shadow or background behind it", hl.clear && (hl.radius === "0px" || !hl.radius), JSON.stringify(hl));
ok("theme toggle: line moon icon, no emoji", (await L.locator(".nav button.icon svg[data-icon=moon]").count()) === 1 && !/\p{Extended_Pictographic}/u.test(await L.locator(".nav button.icon").textContent()));
await L.locator(".nav-bar").screenshot({ path: `${OUT}/01-header-light.png` });
await L.click(".nav button.icon"); await L.waitForTimeout(250);
const hd = await boxless(L);
ok("dark mode: toggle shows the sun line icon", (await L.locator(".nav button.icon svg[data-icon=sun]").count()) === 1);
ok("dark mode: logo auto-inverts (light on dark), still boxless", hd.color !== hl.color && hd.clear && /rgb\((2[0-9]{2}), (2[0-9]{2}), (2[0-9]{2})\)/.test(hd.color ?? ""), `${hl.color} -> ${hd.color}`);
await L.locator(".nav-bar").screenshot({ path: `${OUT}/02-header-dark.png` });
await L.click(".nav button.icon");

// ---------- 1b. flat, full-bleed header at phone and desktop widths ----------
for (const vw of [390, 1280]) {
  const P = await mk({ width: vw, height: 800 }, "light", vw < 500); await P.goto(S + "/"); await P.waitForSelector(".nav-bar .nav .logo");
  const h = await P.evaluate(() => {
    const bar = document.querySelector(".nav-bar"), r = bar.getBoundingClientRect(), t = document.querySelector(".nav .icon"), ts = getComputedStyle(t), bs = getComputedStyle(bar);
    const noShadow = [...document.querySelectorAll(".nav-bar, .nav-bar *")].every((e) => getComputedStyle(e).boxShadow === "none" && !/drop-shadow/.test(getComputedStyle(e).filter));
    return { left: r.left, width: r.width, vw: document.documentElement.clientWidth, bg: bs.backgroundColor, tBg: ts.backgroundColor, tImg: ts.backgroundImage, tShadow: ts.boxShadow, tBorder: parseFloat(ts.borderTopWidth), noShadow };
  });
  ok(`header @${vw}: background spans the full viewport width`, h.left === 0 && Math.round(h.width) === h.vw && h.bg !== "rgba(0, 0, 0, 0)", JSON.stringify({ left: h.left, width: h.width, vw: h.vw }));
  ok(`header @${vw}: toggle is flat (no background, border or shadow)`, (h.tBg === "rgba(0, 0, 0, 0)" || h.tBg === "transparent") && h.tImg === "none" && h.tShadow === "none" && h.tBorder === 0, JSON.stringify({ bg: h.tBg, sh: h.tShadow }));
  ok(`header @${vw}: no drop shadows anywhere in the header`, h.noShadow);
  await P.evaluate(() => scrollTo(0, 900)); await P.waitForTimeout(200);
  ok(`header @${vw}: still full width while sticky`, await P.evaluate(() => { const r = document.querySelector(".nav-bar").getBoundingClientRect(); return r.top === 0 && r.left === 0 && Math.round(r.width) === document.documentElement.clientWidth; }));
  await P.evaluate(() => scrollTo(0, 0)); await P.screenshot({ path: `${OUT}/00-header-full-${vw}.png`, clip: { x: 0, y: 0, width: vw, height: 90 } });
  await P.context().close();
}

// ---------- 2. no emoji in chrome: home (all modes), leaderboard, picker ----------
let found = [];
for (const m of ["Solo", "You vs Agent", "Duel", "Exhibition"]) { await L.click(`button.mode:has-text('${m}')`); await L.waitForTimeout(100); found.push(...await emojiIn(L)); }
ok("home: no emoji in the UI chrome (every mode)", found.length === 0, found.slice(0, 5).join(" | "));
ok("picker: Random keeps its dice exactly as before (Wayne's one exception)", (await L.locator(".char.rand .dice").textContent()) === "🎲" && (await L.locator(".slot .dice").first().textContent()) === "🎲");
ok("chips: shuffle uses a line icon", (await L.locator(".qf .chip.shuf svg[data-icon=shuffle]").count()) === 1);
await L.locator(".slots").scrollIntoViewIfNeeded(); await L.waitForTimeout(200);
await L.screenshot({ path: `${OUT}/03-picker-mobile.png` });
await L.goto(S + "/leaderboard"); await L.waitForTimeout(1500);
found = await emojiIn(L); ok("leaderboard: no emoji in the UI chrome", found.length === 0, found.slice(0, 5).join(" | "));

// ---------- 3. favicons ----------
{ const r = await fetch(`${S}/favicon.v4.svg`); const t = await r.text();
  ok("favicon svg: served as SVG, monochrome, auto-inverts with prefers-color-scheme", r.status === 200 && /svg/.test(r.headers.get("content-type") ?? "") && /prefers-color-scheme: dark/.test(t) && !/#(?!111\b|fff\b)[0-9a-f]{3,6}\b/i.test(t), r.headers.get("content-type"));
  const F = await mk({ width: 520, height: 230 }, "light", false);
  await F.setContent(`<body style="margin:0;font:600 13px system-ui;display:grid;grid-template-columns:1fr 1fr">${["#f2f2f2", "#202124"].map((bg, i) => `<div style="background:${bg};color:${i ? "#eee" : "#222"};padding:16px;display:grid;gap:12px"><div style="display:flex;align-items:center;gap:8px;background:${i ? "#35363a" : "#fff"};border-radius:8px 8px 0 0;padding:8px 10px;width:200px"><img src="${S}/favicon.v4.${i ? "svg" : "svg"}" width="16" height="16" style="${i ? "filter:invert(1)" : ""}"> Bot Battle</div><div style="display:flex;gap:14px;align-items:end"><img src="${S}/favicon.v4.png" width="32" height="32" style="${i ? "filter:invert(1)" : ""}"><img src="${S}/favicon.v4.png" width="16" height="16" style="${i ? "filter:invert(1)" : ""}"><img src="${S}/apple-touch-icon.v4.png" width="60" height="60" style="border-radius:14px"></div><small>${i ? "dark (svg inverts itself; png shown inverted for preview)" : "light"}</small></div>`).join("")}</body>`);
  await imgs(F); await F.screenshot({ path: `${OUT}/04-favicon.png` }); }

// ---------- 4. Pele modal after the game (and: exactly one watching element during the game) ----------
const st = await cx.mutation(api.games.start, { secret: sx(), name: "Chrome Cat", mode: "exhibition", characterId: "grokbot", opponentId: "musey", roundMs: 15000, pele: true, question: "Write a Yelp review of the ocean." });
{ const S1 = await mk(); const S2 = await mk({ width: 1280, height: 860 }, "light", false);
  await S1.goto(`${S}/g/${st.slug}`); await S2.goto(`${S}/g/${st.slug}`);
  for (const [P, w] of [[S1, 390], [S2, 1280]]) {
    await P.waitForSelector(".sharebar .watching", { timeout: 20000 }); await P.waitForTimeout(300);
    ok(`spectator @${w}: exactly one watching element during the game, in the bottom share row`, (await P.locator(".watching").count()) === 1 && (await P.locator(".sharebar .watching").count()) === 1);
  }
  await S1.screenshot({ path: `${OUT}/08-watch-live-one-watching.png`, fullPage: true });
  await S1.context().close(); await S2.context().close(); }
{ const ps = await cx.mutation(api.games.start, { secret: sx(), name: "Chrome Cat", mode: "solo", characterId: "grokbot", roundMs: 15000 });
  const P = await mk(); await P.goto(S + "/"); await P.evaluate(([s, seat]) => localStorage.setItem(`bb.seat.${s}`, seat), [ps.slug, ps.seat]);
  await P.goto(`${S}/play/${ps.slug}`); await P.waitForSelector(".stage-foot .watching", { timeout: 30000 }).catch(() => {});
  ok("player stage: exactly one watching element during the game, below the composer", (await P.locator(".watching").count()) === 1 && (await P.locator(".stage-foot .watching").count()) === 1, `${await P.locator(".watching").count()}`);
  await P.context().close(); }
let v; for (let t = Date.now(); Date.now() - t < 120000;) { v = await cx.query(api.games.view, { slug: st.slug }); if (["finished", "no_contest", "ended"].includes(v.status)) break; await new Promise((r) => setTimeout(r, 1500)); }
ok("pele game finished", v?.status === "finished", v?.status);
const W = await mk(); await W.goto(`${S}/g/${st.slug}`); await W.waitForSelector(".reveal .rv-map .pm-zoomable", { timeout: 20000 }); await W.waitForTimeout(800);
found = await emojiIn(W); ok("watch/reveal page: no emoji in the UI chrome", found.length === 0, found.slice(0, 5).join(" | "));
ok("after the game: battle-box maps are tappable too", (await W.locator(".fighter .pm-zoomable").count()) === 2);
await W.locator(".reveal .rv-map .pm-zoomable").first().scrollIntoViewIfNeeded();
await W.screenshot({ path: `${OUT}/05-reveal-maps-mobile.png` });
await W.locator(".reveal .rv-map .pm-zoomable").first().tap();
await W.waitForSelector(".pmm .pm-modal svg", { timeout: 8000 });
const big = await W.evaluate(() => { const s = document.querySelector(".pmm .pm-modal svg").getBoundingClientRect(); const t = document.querySelector(".pmm .pm-modal svg text"); return { w: s.width, fs: t ? parseFloat(getComputedStyle(t).fontSize || "0") || +t.getAttribute("font-size") : 0 }; });
ok("modal: opens full screen with a large map", (await W.locator(".pmm[role=dialog][aria-modal=true]").count()) === 1 && big.w >= 330, JSON.stringify(big));
await W.waitForTimeout(300); await W.screenshot({ path: `${OUT}/06-pele-modal-mobile.png` });
const sc = () => W.locator(".pmm-in").getAttribute("data-scale").then(Number);
await W.click(".pmm-b[aria-label='Zoom in']"); await W.click(".pmm-b[aria-label='Zoom in']");
ok("modal: zoom in button", (await sc()) > 1.4, await sc());
// pinch: two touch pointers moving apart
const box = await W.locator(".pmm-stage").boundingBox(); const cxp = box.x + box.width / 2, cyp = box.y + box.height / 2;
const s0 = await sc();
await W.evaluate(async ({ x, y }) => {
  const el = document.querySelector(".pmm-stage"); const ev = (type, id, px) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: px, clientY: y, bubbles: true, isPrimary: id === 1 }));
  ev("pointerdown", 1, x - 30); ev("pointerdown", 2, x + 30);
  for (let i = 1; i <= 8; i++) { ev("pointermove", 1, x - 30 - i * 10); ev("pointermove", 2, x + 30 + i * 10); await new Promise((r) => setTimeout(r, 16)); }
  ev("pointerup", 1, x - 110); ev("pointerup", 2, x + 110);
}, { x: cxp, y: cyp });
ok("modal: pinch zooms", (await sc()) > s0 * 1.5, `${s0} -> ${await sc()}`);
const tr0 = await W.locator(".pmm-in").evaluate((e) => e.style.transform);
await W.evaluate(({ x, y }) => { const el = document.querySelector(".pmm-stage"); const ev = (type, px, py) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", clientX: px, clientY: py, bubbles: true, isPrimary: true })); ev("pointerdown", x, y); ev("pointermove", x + 60, y + 40); ev("pointerup", x + 60, y + 40); }, { x: cxp, y: cyp });
ok("modal: drag pans the map", (await W.locator(".pmm-in").evaluate((e) => e.style.transform)) !== tr0);
await W.click(".pmm-b[aria-label='Reset zoom']"); ok("modal: reset zoom", (await sc()) === 1);
await W.keyboard.press("Escape"); await W.waitForTimeout(150);
ok("modal: Esc closes", (await W.locator(".pmm").count()) === 0);
await W.locator(".fighter .pm-zoomable").first().tap(); await W.waitForSelector(".pmm");
ok("modal: close button is a line icon (no ✕ glyph)", (await W.locator(".pmm-x svg[data-icon=x]").count()) === 1 && !(await W.locator(".pmm-x").textContent()).trim());
ok("modal: battle-box map opens it too", (await W.locator(".pmm .pm-modal svg").count()) === 1);
await W.click(".pmm-x"); await W.waitForTimeout(150);
ok("modal: close button closes", (await W.locator(".pmm").count()) === 0);
// desktop wheel zoom
const D = await mk({ width: 1200, height: 860 }, "dark", false); await D.goto(`${S}/g/${st.slug}`); await D.waitForSelector(".reveal .rv-map .pm-zoomable", { timeout: 20000 });
await D.locator(".reveal .rv-map .pm-zoomable").first().click(); await D.waitForSelector(".pmm .pm-modal svg");
await D.mouse.move(600, 430); await D.mouse.wheel(0, -400); await D.waitForTimeout(150);
ok("modal (desktop): wheel zooms", Number(await D.locator(".pmm-in").getAttribute("data-scale")) > 1);
await D.screenshot({ path: `${OUT}/07-pele-modal-desktop-dark.png` });
await D.keyboard.press("Escape");

ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await b.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\nchrome: ${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
