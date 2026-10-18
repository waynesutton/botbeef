// E2E: per-game model swap. "i" button + long-press open a slim sheet of that bot's models (allowlisted, default first);
// the choice is stored on the game only, shown as "powered by X", validated server-side; in a duel each player picks their own.
import { randomBytes } from "node:crypto";
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
import { admin } from "./admin.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const CLOUD = S.replace(".convex.site", ".convex.cloud");
const OUT = "/workspace/agent-battle/share/models";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const mk = async (vp = { width: 390, height: 844 }, o = {}) => { const c = await b.newContext({ viewport: vp, userAgent: UA, ...o }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const cx = new ConvexHttpClient(CLOUD);
const sx = () => randomBytes(32).toString("base64url");
const view = (slug, seat) => cx.query(api.games.view, seat ? { slug, seat } : { slug });
const until = async (slug, pred, ms = 90000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await view(slug); if (pred(v)) return v; await new Promise((r) => setTimeout(r, 1000)); } return v; };
const start = (a) => cx.mutation(api.games.start, { secret: sx(), name: "Model Tester", roundMs: 15000, ...a }).then((r) => r, (e) => ({ err: String(e.data ?? e.message) }));

// ---------- server: allowlist ----------
{ const r = await start({ mode: "duel", characterId: "grokbot", model: "openai/gpt-5.4-mini" });
  ok("server rejects a model from another family", !!r.err && /isn't available/.test(r.err), r.err);
  const r2 = await start({ mode: "duel", characterId: "grokbot", model: "x-ai/grok-4.6" });
  ok("server rejects a same-family model that isn't allowlisted (needs reasoning)", !!r2.err, r2.err);
  const r3 = await start({ mode: "solo", characterId: "grokbot", opponentModel: "x-ai/grok-4.3" });
  ok("server rejects picking the rival's model in solo (Jev picks the rival)", !!r3.err, r3.err);
  const d = await start({ mode: "duel", characterId: "grokbot" });
  const dv = await view(d.slug);
  ok("no choice = the bot's default model", dv.corners[0].model === "x-ai/grok-4.20" && dv.corners[0].modelSwapped === false, dv.corners[0].model);
  await cx.mutation(api.games.endGame, { slug: d.slug, seat: d.seat }); }

// ---------- duel: each player picks their own bot's model ----------
{ const h = await start({ mode: "duel", characterId: "musey", model: "meta/muse-spark-1.2" });
  const tok = h.invite.split("/j/").pop() ?? h.invite;
  let bad = null; try { await cx.mutation(api.games.claimInvite, { token: tok, secret: sx(), name: "Guest Gus", characterId: "sparkle", model: "meta/muse-spark-1.2" }); } catch (e) { bad = String(e.data ?? e.message); }
  ok("duel guest can't take a model outside their own bot's list", !!bad && /isn't available/.test(bad), bad);
  const g = await cx.mutation(api.games.claimInvite, { token: tok, secret: sx(), name: "Guest Gus", characterId: "sparkle", model: "google/gemini-3.5-flash" });
  const v = await view(h.slug);
  ok("duel: host and guest each run their own pick", v.corners[0].model === "meta/muse-spark-1.2" && v.corners[1].model === "google/gemini-3.5-flash" && v.corners.every((c) => c.modelSwapped), JSON.stringify(v.corners.map((c) => c.model)));
  await cx.mutation(api.games.endGame, { slug: h.slug, seat: h.seat }); void g; }

// ---------- exhibition: swapped models actually play (both corners autopilot) ----------
const ex = await start({ mode: "exhibition", characterId: "grokbot", opponentId: "clawd", model: "x-ai/grok-4.3", opponentModel: "anthropic/claude-sonnet-5" });
ok("exhibition with two swapped models starts", !!ex.slug, ex.err);

// ---------- UI: sheet via the "i" button ----------
const P = await mk();
await P.goto(S + "/"); await P.fill("#nm", "Model Mo"); await P.click("button.mode:has-text('Solo')");
const ids = await P.locator(".chars .ci").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
ok("every bot card has a small 'i' (13, incl. Hunch with its single model)", ids.length === 13, ids.length);
ok("'i' is a line icon, no emoji", (await P.locator(".chars .ci svg[data-icon=info]").count()) === 13 && !/\p{Extended_Pictographic}/u.test(await P.locator(".chars .ci").first().innerText()));
const badge = async (pg) => pg.locator(".char-w").evaluateAll((ws) => ws.map((w) => { const c = w.querySelector("button.char").getBoundingClientRect(), i = w.querySelector(".ci").getBoundingClientRect(), t = w.querySelector(".av").getBoundingClientRect();
  return { inside: i.left >= c.left && i.right <= c.right && i.top >= c.top && i.bottom <= c.bottom, clear: i.bottom <= t.top + 0.5, inT: Math.round(i.top - c.top), inR: Math.round(c.right - i.right) }; }));
const chkBadge = (b) => b.every((x) => x.inside && x.clear) && new Set(b.map((x) => `${x.inT},${x.inR}`)).size === 1;
{ const bd = await badge(P); ok("390: 'i' sits inside each card's top-right corner, clear of the art tile, same inset everywhere", chkBadge(bd), JSON.stringify(bd[0])); }
await P.locator(".chars").screenshot({ path: `${OUT}/00-picker-i-mobile.png` });
await P.locator(".char-w:has(button.char[data-id=grokbot]) .ci").click();
const sheet = P.locator(".msh[role=dialog]");
await sheet.waitFor();
const opts = await sheet.locator(".msh-o").evaluateAll((els) => els.map((e) => ({ m: e.dataset.model, on: e.getAttribute("aria-checked"), t: e.innerText })));
ok("sheet lists the bot's models, default first and selected", opts.length === 2 && opts[0].m === "x-ai/grok-4.20" && opts[0].on === "true" && /Default/.test(opts[0].t), JSON.stringify(opts));
ok("sheet shows a speed hint per model", opts.every((o) => /Fastest|Fast|Steady/.test(o.t)));
await P.waitForTimeout(300); await P.screenshot({ path: `${OUT}/01-model-sheet-mobile.png` });
const sheetOk = (pg) => pg.locator(".msh").evaluate((m) => { const av = m.querySelector(".msh-av").getBoundingClientRect(), list = m.querySelector(".msh-list").getBoundingClientRect();
  const rows = [...m.querySelectorAll(".msh-o")].map((r) => { r.scrollIntoView({ block: "nearest" }); const b = r.getBoundingClientRect(); const hit = (x, y) => r.contains(document.elementFromPoint(x, y));
    return hit(b.left + 16, b.top + b.height / 2) && hit(b.left + b.width / 2, b.top + 8) && hit(b.right - 16, b.bottom - 8); });
  return { avSize: Math.round(av.width), avAbove: av.bottom <= list.top + 0.5, rows, positioned: [...m.querySelectorAll(".msh-list *")].some((e) => ["absolute", "fixed"].includes(getComputedStyle(e).position)) }; });
{ const so = await sheetOk(P); ok("390 sheet: ~48px avatar inline in the header, every row fully visible, nothing positioned over the list", so.avSize === 48 && so.avAbove && so.rows.every(Boolean) && !so.positioned, JSON.stringify(so)); }
await P.keyboard.press("Escape");
ok("Esc closes the sheet", (await sheet.count()) === 0);
await P.locator(".char-w:has(button.char[data-id=zozo]) .ci").click(); await sheet.waitFor(); await P.waitForTimeout(250);
{ const so = await sheetOk(P); ok("390 Zozo sheet (Wayne's repro): all 4 rows fully visible", so.rows.length === 4 && so.rows.every(Boolean) && so.avAbove, JSON.stringify(so)); }
await P.screenshot({ path: `${OUT}/01b-model-sheet-zozo-mobile.png` }); await P.keyboard.press("Escape");
await P.locator(".char-w:has(button.char[data-id=hunch]) .ci").click(); await sheet.waitFor();
ok("Hunch sheet: one model, explains why", (await sheet.locator(".msh-o").count()) === 1 && /one model/.test(await sheet.innerText()));
await P.keyboard.press("Escape");
await P.locator(".char-w:has(button.char[data-id=musey]) .ci").click(); await sheet.waitFor();
ok("Muse sheet marks light-thinking models", (await sheet.locator(".msh-o:has-text('light thinking')").count()) === 4);
await P.waitForTimeout(250); await P.screenshot({ path: `${OUT}/02-model-sheet-muse.png` });
await sheet.locator(".msh-x").click();
ok("✕ closes the sheet", (await sheet.count()) === 0);

// ---------- UI: long-press opens the sheet and doesn't select the card ----------
const before = await P.locator("button.char[data-id=clawd]").getAttribute("aria-checked");
await P.locator("button.char[data-id=clawd]").scrollIntoViewIfNeeded();
const bb = await P.locator("button.char[data-id=clawd]").boundingBox();
await P.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await P.mouse.down(); await P.waitForTimeout(700); await P.mouse.up();
ok("long-press opens that bot's sheet", (await sheet.count()) === 1 && /Claude/.test(await sheet.innerText()));
ok("long-press doesn't change the selection", (await P.locator("button.char[data-id=clawd]").getAttribute("aria-checked")) === before);
await P.keyboard.press("Escape");

// ---------- UI: choose, start, see "powered by X" ----------
await P.click("button.char[data-id=grokbot]");
await P.locator(".char-w:has(button.char[data-id=grokbot]) .ci").click(); await sheet.waitFor();
await sheet.locator(".msh-o[data-model='x-ai/grok-4.3']").click();
ok("picking closes the sheet and badges the card", (await sheet.count()) === 0 && (await P.locator("button.char[data-id=grokbot] .cm").innerText()) === "Grok 4.3");
await P.locator(".chars").screenshot({ path: `${OUT}/03-picker-badge.png` });
await P.click("button.btn.big"); await P.waitForURL(/\/play\//);
const slug = P.url().split("/").pop();
const sv = await until(slug, (v) => v && v.corners[0].model);
ok("game stores the chosen model on the host corner", sv.corners[0].model === "x-ai/grok-4.3" && sv.corners[0].modelSwapped, sv.corners[0].model);
ok("rival (Jev's pick) runs its default", sv.corners[1].modelSwapped === false || sv.corners[1].model === null);
const done = await until(slug, (v) => ["finished", "no_contest"].includes(v.status), 120000);
await P.goto(`${S}/g/${slug}`); await P.waitForSelector(".f-id .pw");
const pw = await P.locator(".f-id small").allInnerTexts();
ok("watch page shows 'powered by grok-4.3' (swapped model highlighted)", pw.some((t) => /powered by x-ai\/grok-4\.3/.test(t)) && (await P.locator(".pw.swapped[data-model='x-ai/grok-4.3']").count()) >= 1, `${done.status} ${JSON.stringify(pw)}`);
await P.screenshot({ path: `${OUT}/04-powered-by.png` });
// the choice was for that game only
await P.goto(S + "/"); await P.click("button.mode:has-text('Solo')");
ok("model choice doesn't carry over to the next visit", (await P.locator("button.char[data-id=grokbot] .cm").count()) === 0);

// ---------- desktop + dark ----------
const D = await mk({ width: 1280, height: 860 }, { colorScheme: "dark" });
await D.goto(S + "/"); await D.click("button.mode:has-text('Exhibition')");
await D.locator(".char-w:has(button.char[data-id=deepy]) .ci").click(); await D.locator(".msh").waitFor(); await D.waitForTimeout(300);
await D.screenshot({ path: `${OUT}/05-model-sheet-desktop-dark.png` });
{ const so = await sheetOk(D); ok("desktop sheet: avatar inline, all rows fully visible", so.avSize === 48 && so.avAbove && so.rows.every(Boolean) && !so.positioned, JSON.stringify(so)); }
await D.keyboard.press("Escape"); await D.locator(".char-w:has(button.char[data-id=zozo]) .ci").click(); await D.locator(".msh").waitFor(); await D.waitForTimeout(250);
await D.screenshot({ path: `${OUT}/05b-model-sheet-zozo-desktop.png` });
{ const bd = await badge(D); ok("desktop: 'i' inside each card's top-right corner, clear of the tile", chkBadge(bd), JSON.stringify(bd[0])); }
ok("desktop sheet is centered and slim", await D.locator(".msh").evaluate((e) => { const r = e.getBoundingClientRect(); return r.width <= 440 && Math.abs(r.left + r.width / 2 - innerWidth / 2) < 4; }));

// ---------- exhibition result ----------
const ev = await until(ex.slug, (v) => ["finished", "no_contest"].includes(v.status), 120000);
ok("exhibition on swapped models finishes with both answers", ev.status === "finished" && ev.corners.every((c) => (c.answer ?? "").length > 10), ev.status);
ok("exhibition view reports both swapped models", ev.corners[0].model === "x-ai/grok-4.3" && ev.corners[1].model === "anthropic/claude-sonnet-5");
const am = admin("modelsAdmin:answerModels", { slug: ex.slug });
ok("engine called the swapped models (answers table)", JSON.stringify(am) === JSON.stringify(["x-ai/grok-4.3", "anthropic/claude-sonnet-5"]), JSON.stringify(am));

ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await b.close();
const f = results.filter((r) => !r.pass);
console.log(`\n${results.length - f.length}/${results.length} passed`);
process.exit(f.length ? 1 : 0);
