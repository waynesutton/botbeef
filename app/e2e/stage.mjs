// E2E: the live typing stage on a phone. Full labelled question (wraps, never truncated when there's room; with the keyboard
// open it may clamp but taps open in full), watching + Play on X below the input, Pele chips off the faces, small empty maps.
import { chromium, devices } from "/tmp/pw/node_modules/playwright/index.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share/stage";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const P = await ctx.newPage();
P.on("pageerror", (e) => errors.push(String(e))); P.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const Q = "Write a motivational speech for a sleepy robot who must win the big Monday morning dance battle against a toaster, a cat and three very confident houseplants.";
await P.goto(S + "/"); await P.fill("#nm", "Stage Sam"); await P.click("button.mode:has-text('You vs Agent')");
await P.click(".seg button:has-text('30s')");
if ((await P.locator(".pele-t").getAttribute("aria-checked")) !== "true") await P.click(".pele-t");
await P.fill("#q", Q); await P.click("button.btn.big");
await P.waitForURL(/\/play\//);
await P.waitForSelector(".stage .stage-q .sq-t", { timeout: 30000 });
await P.waitForFunction((q) => document.querySelector(".stage .sq-t")?.textContent === q, Q, { timeout: 15000 }).catch(() => {});
const geo = (sel) => P.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width }; }, sel);
const qState = () => P.evaluate(() => { const p = document.querySelector(".stage .stage-q > .stage-chal"); const r = p.getBoundingClientRect(); return { text: p.querySelector(".sq-t").textContent, clamped: p.scrollHeight > p.clientHeight + 1, lines: Math.round(r.height / parseFloat(getComputedStyle(p).lineHeight)), inView: r.top >= 0 && r.bottom <= (visualViewport?.height ?? innerHeight) + 1, label: p.querySelector(".sq-k")?.textContent, tag: p.querySelector(".sq-tag")?.textContent, tagShown: getComputedStyle(p.querySelector(".sq-tag")).display !== "none" }; });
const fits = () => P.evaluate(() => {
  const vh = window.visualViewport?.height ?? innerHeight, vw = innerWidth;
  const sel = [".strip .s0 .av", ".strip .s1 .av", ".tug", ".strip .timer", ".stage-q", ".la0 .la-t", "#draft", ".composer button.btn", ".stage-foot .watching", ".stage-foot .play-x"];
  const bad = sel.filter((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return !r || r.height < 8 || r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1; });
  const st = document.querySelector(".stage");
  return { bad, stageFits: !!st && st.scrollHeight <= st.clientHeight + 1 };
});

// ---- roomy phone (no keyboard) ----
await P.waitForSelector("#draft:not([disabled])", { timeout: 30000 });
let q = await qState();
ok("full question shown, wrapping, not truncated", q.text === Q && !q.clamped && q.lines >= 2 && q.inView, JSON.stringify({ clamped: q.clamped, lines: q.lines }));
ok("question has a clear label + keeps the mode/length tag", /^(Question|Challenge):$/.test(q.label ?? "") && q.tagShown && /You vs Agent · 30s/.test(q.tag ?? ""), `${q.label} | ${q.tag}`);
ok("watching pill + Play on X moved out of the question row", (await P.locator(".stage-q .watching, .stage-q .play-x, .stage-row").count()) === 0);
const btn = await geo(".composer button.btn"), w = await geo(".stage-foot .watching"), x = await geo(".stage-foot .play-x");
ok("watching + Play on X sit below the answer box / Lock in", btn && w && x && w.top >= btn.bottom - 1 && x.top >= btn.bottom - 1, JSON.stringify({ lock: btn?.bottom, watch: w?.top, x: x?.top }));
let f = await fits();
ok("phone: strip (both agents, score, timer), question, lanes, input and footer all fit", !f.bad.length && f.stageFits, JSON.stringify(f));
// Pele: chips never cover a face; empty maps are small
const overlap = await P.evaluate(() => [0, 1].map((i) => { const a = document.querySelector(`.strip .s${i} .av`).getBoundingClientRect(), c = document.querySelector(`.strip-f.s${i} .strip-map`)?.getBoundingClientRect(); if (!c) return -1; const ix = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)), iy = Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)); return ix * iy; }));
ok("Pele node-count chips don't overlap the avatars", overlap.every((o) => o === 0), overlap.join(","));
const empty = await P.evaluate(() => { const m = document.querySelector(".la0 .la-map .pm"); const r = m?.querySelector(".pm-root")?.getBoundingClientRect(); return { empty: m?.classList.contains("empty"), svg: m?.querySelectorAll("svg").length ?? -1, rootH: r?.height ?? 0, rootW: r?.width ?? 0 }; });
ok("empty Pele map is a small root pill (no big centre circle)", empty.empty && empty.svg === 0 && empty.rootH > 0 && empty.rootH < 30, JSON.stringify(empty));
await P.waitForTimeout(800); await P.screenshot({ path: `${OUT}/01-mobile-ingame-empty.png` });
await P.type("#draft", "Rise up, sleepy robot, the toaster fears your moonwalk, ", { delay: 30 }); await P.waitForTimeout(1500);
ok("map grows from the pill once words land", +(await P.locator(".la0 .la-map .pm").getAttribute("data-nodes")) >= 1 && (await P.locator(".la0 .la-map .pm svg.pele").count()) === 1);
await P.screenshot({ path: `${OUT}/02-mobile-ingame.png` });

// ---- keyboard open ----
await P.setViewportSize({ width: 390, height: 420 }); await P.focus("#draft"); await P.type("#draft", "dance ", { delay: 30 }); await P.waitForTimeout(900);
f = await fits();
ok("keyboard open: strip, question, lanes, input and footer all fit, no stage scroll", !f.bad.length && f.stageFits, JSON.stringify(f));
q = await qState();
ok("keyboard open: question stays readable (>= 2 lines, labelled)", q.lines >= 2 && /:$/.test(q.label ?? "") && q.inView, JSON.stringify({ lines: q.lines, clamped: q.clamped }));
await P.screenshot({ path: `${OUT}/03-mobile-ingame-keyboard.png` });
if (q.clamped) {
  ok("keyboard open: clamped question shows a 'Full' hint", await P.locator(".stage-q .sq-more").isVisible());
  await P.locator(".stage-q > .stage-chal").click();
  await P.waitForSelector(".sq-full", { timeout: 3000 });
  const full = await P.evaluate(() => { const e = document.querySelector(".sq-full"); const r = e.getBoundingClientRect(); return { text: e.querySelector(".sq-t").textContent, inView: r.top >= 0 && r.bottom <= (visualViewport?.height ?? innerHeight) + 1, clamped: e.scrollHeight > e.clientHeight + 1 }; });
  ok("tap-to-expand shows the full question on screen", full.text === Q && full.inView && !full.clamped, JSON.stringify(full));
  ok("strip stays visible while the full question is open", (await P.evaluate(() => { const s = document.querySelector(".strip").getBoundingClientRect(), o = document.querySelector(".sq-full").getBoundingClientRect(); return o.top >= s.bottom - 1; })));
  await P.screenshot({ path: `${OUT}/04-mobile-ingame-keyboard-question-open.png` });
  await P.click(".sq-close"); ok("close returns to the clamped question", (await P.locator(".sq-full").count()) === 0);
} else ok("keyboard open: full question shown (no clamp needed)", q.text === Q);
await P.setViewportSize({ width: 390, height: 664 });
const xi = await (async () => { const h = await P.locator(".stage-foot .play-x").getAttribute("href"); return new URL(h); })();
ok("bottom Play on X is still the compose intent for this game", xi.origin === "https://twitter.com" && xi.pathname === "/intent/tweet" && /\/g\/[0-9A-Za-z]{10}$/.test(xi.searchParams.get("url") ?? ""));
await P.click("button:has-text('Lock in')").catch(() => {});
ok("no page or console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await b.close();
const pass = results.filter((r) => r.pass).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
