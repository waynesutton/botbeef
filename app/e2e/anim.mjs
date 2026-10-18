// E2E for the 2D cut-out puppets: all 13 rigs load, distinct nod/lose/sad, a real typing pose, expand in game and
// after the game (reveal), never in the picker, reduced motion = no animations. Screens -> share/anim/.
import { chromium, devices } from "/tmp/pw/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share/anim"; mkdirSync(OUT, { recursive: true });
const KEYS = ["grokbot", "musey", "dotty", "sparkle", "deepy", "clawd", "kimmy", "hermy", "hunch", "zozo", "townsy", "pinchy", "house"];
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const mk = async (o) => { const c = await b.newContext(o); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); return { c, p }; };

// Picker: static art, no puppets, no tap-to-expand
const { p: H } = await mk({ ...devices["iPhone 13"] });
await H.goto(S + "/"); await H.waitForSelector("button.char");
ok("picker has no live puppets or expand affordance", (await H.locator("button.char .pp, button.char .av.tap").count()) === 0);
await H.click("button.char:has-text('Kimmy')"); await H.waitForTimeout(500);
ok("tapping a picker card does not open the expand view", (await H.locator(".xv").count()) === 0);
// All 13 rigs build from their atlases
const probes = await H.evaluate(async (ks) => Promise.all(ks.map((k) => window.__pp.probe(k).catch((e) => ({ key: k, err: String(e) })))), KEYS);
for (const r of probes) ok(`rig loads: ${r.key}`, !r.err && r.parts >= 6 && r.w > 0, r.err ?? `${r.parts} parts`);

// Reduced motion: puppets render but never animate
const { p: R } = await mk({ ...devices["iPhone 13"], reducedMotion: "reduce" });
await R.goto(S + "/"); await R.waitForSelector("button.char");
const rm = await R.evaluate(async () => { await window.__pp.probe("grokbot"); return document.getAnimations().filter((a) => a.effect?.target?.closest?.(".pp")).length; });
ok("reduced motion: no puppet animations", rm === 0, String(rm));

// Solo game on the phone
const P = H;
await P.fill("#nm", "E2E Anim"); await P.click("button.mode:has-text('Solo')"); await P.click("button.char:has-text('Grokbot')"); await P.click("button.btn.big");
await P.waitForURL(/\/play\/[0-9A-Za-z]{10}$/, { timeout: 15000 }); const slug = P.url().split("/").pop();
await P.waitForSelector("#draft:not([disabled])", { timeout: 25000 });
await P.waitForSelector(".strip .av.pup", { timeout: 10000 });
await P.type("#draft", "Be dramatic and funny, one clever pun, specific details, and a mic drop", { delay: 80 });
await P.waitForTimeout(150); const typing = await P.locator(".strip .s0 .pp").getAttribute("data-move");
ok("while typing the player's bot is in the typing move (or a one-shot)", ["type", "nod", "jump", "kick", "hit"].includes(typing), typing);
await P.screenshot({ path: `${OUT}/01-mobile-battle-typing.png` });
// Freeze poses on the strip puppet (index 0 = left corner) and read back part transforms
const live = await P.evaluate(() => window.__pp.live());
const i0 = live.findIndex((x) => x.key === "grokbot");
const at = async (m, ms) => { await P.evaluate(([i, m, ms]) => window.__pp.pose(i, m, ms), [i0, m, ms]); await P.waitForTimeout(60); return P.evaluate((i) => window.__pp.read(i), i0); };
const ty = await at("type", 140);
ok("typing pose: plush keyboard shown, arms swung forward/in, head tilted down at it", +ty.kb.o > 0.9 && Math.abs(ty.armL.a) > 20 && Math.abs(ty.armR.a) > 20 && Math.sign(ty.armL.a) !== Math.sign(ty.armR.a) && ty.head.y > 0, JSON.stringify({ kb: ty.kb.o, L: ty.armL.a, R: ty.armR.a, headY: ty.head.y }));
const ty2 = await at("type", 280);
ok("typing pose: hands alternate taps", Math.abs(ty2.armL.a - ty.armL.a) > 2 && Math.abs(ty2.armR.a - ty.armR.a) > 2, `${ty.armL.a}->${ty2.armL.a} / ${ty.armR.a}->${ty2.armR.a}`);
await P.locator(".strip .s0 .av").screenshot({ path: `${OUT}/02-strip-typing-pose.png` });
const nod = await at("nod", 115), lose = await at("lose", 1700), sad = await at("sad", 1970), idle = await at("idle", 0);
ok("nod: quick head dip only (body upright, arms at rest)", nod.head.y > 0 && Math.abs(nod.armR.a) < 3 && nod.root.sy > 0.98, JSON.stringify(nod.head));
ok("lose: knees buckle, head drops, arms flop (one-shot)", lose.root.sy < 0.9 && Math.abs(lose.legL.a) > 5 && lose.head.a > 12 && lose.head.y > nod.head.y, JSON.stringify({ sy: lose.root.sy, leg: lose.legL.a, head: lose.head }));
ok("sad: slumped loop with an eye wipe (arm raised in front of the face)", sad.root.sy < 0.9 && sad.armR.z === "60" && Math.abs(sad.armR.a) > 60 && sad.head.a > 8, JSON.stringify({ sy: sad.root.sy, arm: sad.armR }));
const dist = (a, c) => ["root", "head", "armL", "armR", "legL"].reduce((s, k) => s + Math.abs(a[k].a - c[k].a) + Math.abs(a[k].y - c[k].y) + 100 * Math.abs(a[k].sy - c[k].sy), 0);
ok("nod, lose and sad are clearly different poses", dist(nod, lose) > 30 && dist(nod, sad) > 30 && dist(lose, sad) > 30 && dist(idle, nod) > 1, [dist(nod, lose), dist(nod, sad), dist(lose, sad)].map((x) => x.toFixed(0)).join("/"));
for (const [m, ms] of [["nod", 115], ["lose", 1700], ["sad", 1970], ["cheer", 470], ["kick", 430], ["jump", 470]]) { await at(m, ms); await P.locator(".strip .s0 .av").screenshot({ path: `${OUT}/03-strip-${m}.png` }); }
await P.evaluate((i) => window.__pp.release(i), i0);
// In-game expand (tap the strip avatar)
await P.locator(".strip .s0 .av.tap").click(); await P.waitForSelector(".xv-stage .pp", { timeout: 5000 });
ok("in-game: tap a bot -> 2D expand view", (await P.locator(".xv .pp .pp-s").count()) >= 6);
const m0 = await P.locator(".xv-stage").getAttribute("data-move"); await P.locator(".xv-stage").click(); await P.waitForTimeout(250);
const m1 = await P.locator(".xv-stage").getAttribute("data-move");
ok("expand: tap cycles moves", m0 !== m1, `${m0} -> ${m1}`);
await P.waitForTimeout(500); await P.screenshot({ path: `${OUT}/04-expand-in-game.png` });
await P.keyboard.press("Escape"); await P.waitForTimeout(200);
ok("expand: Esc closes", (await P.locator(".xv").count()) === 0);
// After the game (reveal)
await P.waitForSelector(".reveal", { timeout: 90000 }); await P.waitForTimeout(2500);
await P.screenshot({ path: `${OUT}/05-reveal-mobile.png` });
await P.locator(".arena .av.tap").first().click(); await P.waitForSelector(".xv-stage .pp", { timeout: 5000 });
ok("after the game: tap a bot on the reveal -> 2D expand view", (await P.locator(".xv .pp").count()) === 1);
await P.waitForTimeout(700); await P.screenshot({ path: `${OUT}/06-expand-after-game.png` });
await P.locator(".xv-x").click(); await P.waitForTimeout(200);
ok("expand: ✕ closes", (await P.locator(".xv").count()) === 0);
await b.close();
const fails = results.filter((r) => !r.pass);
console.log(JSON.stringify({ slug, pass: results.length - fails.length, total: results.length, fails: fails.map((f) => f.name), consoleErrors: errors.slice(0, 8) }, null, 1));
