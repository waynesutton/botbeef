// E2E: Duel (invite link, single-use, drafts hidden from opponent + spectators until reveal) and Exhibition.
import { randomBytes } from "node:crypto";
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const CLOUD = S.replace(".convex.site", ".convex.cloud");
const OUT = "/workspace/agent-battle/share";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const imgs = (p) => p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
const b = await chromium.launch();
const mk = async (vp = { width: 1100, height: 860 }) => { const c = await b.newContext({ viewport: vp, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const H = await mk(), G = await mk({ width: 390, height: 844 }), W = await mk(), X = await mk();
await H.goto(S + "/"); await H.fill("#nm", "Host Hank"); await H.click("button.mode:has-text('Duel')"); await H.click("button.char:has-text('Musey')"); await H.click("button.btn.big");
await H.waitForURL(/\/play\//); const slug = H.url().split("/").pop();
await H.waitForSelector("code.link"); const invite = await H.locator("code.link").textContent();
ok("host sees single-use invite link", /\/j\/[A-Za-z0-9_-]{43}$/.test(invite ?? ""), invite?.slice(-12));
await imgs(H); await H.screenshot({ path: `${OUT}/14-duel-lobby.png`, fullPage: true });
{ const h = new URL(await H.locator(".sharebar .play-x").getAttribute("href"));
  ok("lobby Play on X -> compose intent with this game's /g link", h.origin === "https://twitter.com" && h.pathname === "/intent/tweet" && (await H.locator(".sharebar .play-x").getAttribute("target")) === "_blank" && h.searchParams.get("url") === `${S}/g/${slug}` && /looking for a \d+-second battle/.test(h.searchParams.get("text")), h.searchParams.get("text"));
  ok("lobby keeps Copy invite", (await H.locator("button:has-text('Copy invite')").count()) === 1); }
await W.goto(`${S}/g/${slug}`); await W.waitForSelector("text=Waiting for");
ok("watch page shows waiting for challenger", true);
ok("watch page never shows invite", !(await W.content()).includes(invite.split("/j/")[1]));
await G.goto(invite); await G.waitForSelector("text=called you out");
{ // Character select: the host's bot (Musey) stays in its grid slot, greyed, labelled P1, not selectable.
  const ids = await G.locator(".chars button.char:not(.rand)").evaluateAll((els) => els.map((e) => e.dataset.id));
  ok("duel join: all 13 bots shown in roster order", ids.length === 13 && ids.join() === "grokbot,musey,dotty,sparkle,deepy,clawd,kimmy,hermy,hunch,zozo,townsy,pinchy,bolt", ids.join());
  const m = G.locator("button.char[data-id=musey]");
  const st = await m.evaluate((e) => ({ taken: e.classList.contains("taken"), dis: e.disabled, tag: e.querySelector(".tk")?.textContent, small: e.querySelector("small")?.textContent, gray: getComputedStyle(e.querySelector(".av")).filter, ring: getComputedStyle(e).borderTopColor }));
  ok("duel join: host's bot greyed, labelled P1/Taken, owner's color ring, not selectable", st.taken && st.dis && st.tag === "P1" && /Taken/.test(st.small) && /grayscale/.test(st.gray) && st.ring === "rgb(255, 90, 54)", JSON.stringify(st));
  await m.click({ force: true }).catch(() => {});
  ok("duel join: tapping the taken bot does nothing", (await m.getAttribute("aria-checked")) !== "true");
  await G.locator(".chars").screenshot({ path: "/workspace/agent-battle/share/chrome/09-duel-join-taken.png" }); }
await G.fill("#nm2", "Guest Gina"); await G.click("button.char:has-text('Sparkle')"); await G.click("button:has-text('Accept the battle')");
await G.waitForURL(/\/play\//);
ok("guest lands in the same game", G.url().endsWith(slug));
await X.goto(invite); await X.waitForSelector("text=This seat is taken.");
ok("invite is single-use (second opener sees seat taken)", true);
await Promise.all([H.waitForSelector("#draft:not([disabled])", { timeout: 20000 }), G.waitForSelector("#draft:not([disabled])", { timeout: 20000 })]);
await Promise.all([
  H.type("#draft", "HOSTSECRET be adorable but brutally precise, use a pun about rain", { delay: 60 }),
  G.type("#draft", "GUESTSECRET go hyper sparkly, three short punchy lines, end with a wink", { delay: 60 }),
]);
await H.waitForTimeout(3000);
const hHtml = await H.content(), gHtml = await G.content(), wHtml = await W.content();
ok("host can't see guest prompt", !hHtml.includes("GUESTSECRET"));
ok("guest can't see host prompt", !gHtml.includes("HOSTSECRET"));
ok("spectator can't see either prompt", !wHtml.includes("HOSTSECRET") && !wHtml.includes("GUESTSECRET"));
ok("spectator sees hidden-until-reveal indicator", wHtml.includes("hidden until the reveal"));
// Server-side check, not CSS: spectator projection has null text
const cx = new ConvexHttpClient(CLOUD);
const pv = await cx.query(api.games.view, { slug });
ok("server projection hides duel text from spectators", pv.corners.every((c) => c.draft === null && c.answer === null), JSON.stringify(pv.corners.map((c) => [c.draft, c.answer])));
const forged = await cx.query(api.games.view, { slug, seat: "x".repeat(43) });
ok("forged seat gets spectator view", forged.me === -1);
let threw = false; try { await cx.mutation(api.games.type, { slug, seat: "y".repeat(43), seq: 99, text: "hijack" }); } catch { threw = true; }
ok("forged seat can't type", threw);
await imgs(W); await W.screenshot({ path: `${OUT}/15-duel-watch-hidden.png`, fullPage: true });
await G.screenshot({ path: `${OUT}/16-duel-guest-mobile.png`, fullPage: true });
await G.setViewportSize({ width: 390, height: 420 }); await G.waitForTimeout(500);
await G.screenshot({ path: `${OUT}/24-duel-guest-typing-keyboard.png` });
await H.screenshot({ path: `${OUT}/25-duel-host-typing-desktop.png` });
const oppHidden = await H.locator(".la1 .la-t").textContent();
ok("duel stage hides the rival's draft while typing", !/GUESTSECRET/.test(await H.content()) && /hidden until the reveal/.test(oppHidden ?? ""), (oppHidden ?? "").slice(0, 50));
await Promise.all([H.click("button:has-text('Lock in')"), G.click("button:has-text('Lock in')")]);
await W.waitForSelector(".reveal", { timeout: 60000 });
const after = await W.content();
ok("after reveal, both prompts are public", after.includes("HOSTSECRET") && after.includes("GUESTSECRET"));
await imgs(W); await W.screenshot({ path: `${OUT}/17-duel-reveal.png`, fullPage: true });

// Exhibition
await X.goto(S + "/"); await X.fill("#nm", "Show Runner"); await X.click("button.mode:has-text('Exhibition')");
ok("exhibition shows a two-slot picker with Random", (await X.locator(".slots .slot").count()) === 2 && (await X.locator("button.char.rand").count()) === 1);
await X.click("button.char:has-text('Deepy')");
ok("after picking left, right slot is active", (await X.locator(".slot.s1.on").count()) === 1);
{ const d = X.locator("button.char[data-id=deepy]");
  ok("right picker keeps Deepy in place, greyed and labelled P1 (no mirror)", (await X.locator(".chars button.char:not(.rand)").count()) === 13 && (await d.evaluate((e) => e.classList.contains("taken") && e.disabled && e.querySelector(".tk")?.textContent === "P1"))); }
await X.click("button.char:has-text('Kimmy')"); await imgs(X);
await X.click(".slot.s0"); await X.waitForTimeout(100);
ok("left picker shows the right corner's Kimmy greyed, labelled P2", await X.locator("button.char[data-id=kimmy]").evaluate((e) => e.classList.contains("taken") && e.disabled && e.querySelector(".tk")?.textContent === "P2"));
await X.locator(".slots").locator("xpath=..").screenshot({ path: "/workspace/agent-battle/share/chrome/10-exhibition-taken.png" });
await X.click(".slot.s1"); await X.waitForTimeout(100);
ok("slots read Deepy vs Kimmy", /Deepy/.test(await X.locator(".slot.s0").textContent()) && /Kimmy/.test(await X.locator(".slot.s1").textContent()));
await X.locator(".slots").locator("xpath=..").screenshot({ path: `${OUT}/39-exhibition-two-slot-picker.png` });
await X.click("button.btn.big");
await X.waitForURL(/\/g\//); const ex = X.url().split("/").pop();
{ const v0 = await cx.query(api.games.view, { slug: ex }); ok("exhibition starts with the host's two picks", v0.corners[0].characterId === "deepy" && v0.corners[1].characterId === "kimmy", v0.corners.map((c) => c.characterId).join(" vs ")); }
// Server validation (fresh sessions so the per-session start limit isn't hit)
const sx = () => randomBytes(32).toString("base64url");
const tryStart = (a) => cx.mutation(api.games.start, { secret: sx(), name: "Slot Tester", mode: "exhibition", ...a }).then(() => "ok", (e) => String(e.data ?? e.message));
ok("server rejects a mirror match", /mirror/i.test(await tryStart({ characterId: "clawd", opponentId: "clawd" })));
ok("server rejects an unknown bot", /roster/i.test(await tryStart({ characterId: "nope", opponentId: "random" })));
{ const r = await cx.mutation(api.games.start, { secret: sx(), name: "Slot Tester", mode: "exhibition", characterId: "random", opponentId: "random" });
  let vv; for (let i = 0; i < 20; i++) { vv = await cx.query(api.games.view, { slug: r.slug }); if (vv.corners[1].characterId) break; await new Promise((q) => setTimeout(q, 1000)); }
  ok("random vs random resolves to two different bots", vv.corners[0].characterId && vv.corners[1].characterId && vv.corners[0].characterId !== vv.corners[1].characterId, vv.corners.map((c) => c.characterId).join(" vs ")); }
await X.waitForSelector(".meter-num", { timeout: 20000 });
await X.waitForTimeout(20000); await imgs(X);
await X.screenshot({ path: `${OUT}/18-exhibition-live.png`, fullPage: true });
await X.waitForSelector(".reveal", { timeout: 70000 });
ok("exhibition finishes", true, ex);
const E = await mk({ width: 640, height: 480 });
await E.goto(`${S}/g/${ex}?embed=1`); await E.waitForSelector(".reveal"); await imgs(E);
await E.screenshot({ path: `${OUT}/19-in-tweet-embed-finished.png` });
await b.close();
console.log(JSON.stringify({ slug, ex, pass: results.filter((r) => r.pass).length, total: results.length, errors: errors.slice(0, 5) }));
