// E2E: haptics. navigator.vibrate is stubbed to record patterns. Checks bot select, Start, countdown go, win/lose,
// expand-view taps; nothing with reduced motion; a silent no-op where vibrate doesn't exist (iOS Safari); no UI change.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const STUB = () => { const log = JSON.parse(sessionStorage.getItem("vib") ?? "[]"); window.__vib = log;
  Object.defineProperty(Navigator.prototype, "vibrate", { configurable: true, value: (p) => { window.__vib.push(JSON.stringify(p)); sessionStorage.setItem("vib", JSON.stringify(window.__vib)); return true; } }); };
const NONE = () => { delete Navigator.prototype.vibrate; };
const mk = async (o = {}, init = STUB) => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, ...o }); await c.addInitScript(init); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const vib = (p) => p.evaluate(() => window.__vib ?? []);
const SEL = "[8]", START = "[12]", GO = "[20,40,20]", WIN = "[30,50,30,50,60]", LOSE = "[60]", TAP = "[6]";

const P = await mk();
await P.goto(S + "/"); await P.fill("#nm", "Buzz Bea"); await P.click("button.mode:has-text('Solo')");
const html0 = await P.locator(".form").innerHTML();
await P.click("button.char[data-id=sparkle]");
ok("bot select buzzes [8]", (await vib(P)).at(-1) === SEL, JSON.stringify(await vib(P)));
ok("no UI change from haptics (form markup only differs by the selection)", (await P.locator(".form").innerHTML()).replace(/ on"|aria-checked="(true|false)"/g, "").length === html0.replace(/ on"|aria-checked="(true|false)"/g, "").length);
await P.click("button.btn.big");
await P.waitForURL(/\/play\//);
ok("Start buzzes [12]", (await vib(P)).includes(START), JSON.stringify(await vib(P)));
await P.waitForSelector("#draft:not([disabled])", { timeout: 45000 });
await P.waitForTimeout(400);
ok("countdown go buzzes [20,40,20] once", (await vib(P)).filter((x) => x === GO).length === 1, JSON.stringify(await vib(P)));
await P.type("#draft", "short bright lines about sunshine and a wink", { delay: 30 });
await P.waitForSelector(".reveal, .rv", { timeout: 120000 }).catch(() => {});
await P.waitForFunction(() => (window.__vib ?? []).some((x) => x === "[30,50,30,50,60]" || x === "[60]"), null, { timeout: 60000 }).catch(() => {});
const end = (await vib(P)).filter((x) => x === WIN || x === LOSE);
ok("result buzzes once: celebratory on a win, single on a loss", end.length === 1, JSON.stringify(end));
// a finished game opened fresh doesn't buzz
const slug = P.url().split("/").pop();
await P.evaluate(() => { sessionStorage.setItem("vib", "[]"); });
await P.goto(`${S}/play/${slug}`); await P.waitForTimeout(2500);
ok("re-opening a finished game doesn't buzz", (await vib(P)).length === 0, JSON.stringify(await vib(P)));
// expand view taps
await P.locator(".arena .av.tap").first().click(); await P.waitForSelector(".xv-stage .pp", { timeout: 8000 });
await P.locator(".xv-stage").click(); await P.locator(".xv-stage").click();
ok("expand-view character taps buzz [6] each", (await vib(P)).filter((x) => x === TAP).length === 2, JSON.stringify(await vib(P)));

// reduced motion: nothing
const R = await mk({ reducedMotion: "reduce" });
await R.goto(S + "/"); await R.click("button.mode:has-text('Solo')"); await R.click("button.char[data-id=deepy]"); await R.click("button.char[data-id=clawd]");
ok("reduced motion: no vibration at all", (await vib(R)).length === 0, JSON.stringify(await vib(R)));
// no vibrate API (iOS Safari): silent no-op
const N = await mk({}, NONE);
await N.goto(S + "/"); await N.click("button.mode:has-text('Solo')"); await N.click("button.char[data-id=deepy]");
ok("no navigator.vibrate: selection still works, no errors", (await N.locator("button.char[data-id=deepy]").getAttribute("aria-checked")) === "true" && (await N.evaluate(() => typeof navigator.vibrate)) === "undefined");

ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await b.close();
const f = results.filter((r) => !r.pass);
console.log(`\n${results.length - f.length}/${results.length} passed`);
process.exit(f.length ? 1 : 0);
