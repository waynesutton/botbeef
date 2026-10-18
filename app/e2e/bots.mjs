// E2E: /bots page. Header link (flat, next to Leaderboard), Jev featured as THE JUDGE, all 13 bots as trading cards
// (idle-animating puppet, name, tagline, vibe, default model, swap-in count from the allowlist), tap -> expand view,
// Jev's own moves (gavel bang, score flip, nod), no emoji, SEO (title, OG image, sitemap, llms.txt, agents.md).
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share/bots";
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const mk = async (vp, o = {}) => { const c = await b.newContext({ viewport: vp, userAgent: UA, ...o }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const ORDER = "grokbot,musey,dotty,sparkle,deepy,clawd,kimmy,hermy,hunch,zozo,townsy,pinchy,bolt";
const ALTS = { grokbot: 1, musey: 3, dotty: 4, sparkle: 4, deepy: 3, clawd: 2, kimmy: 3, hermy: 1, hunch: 0, zozo: 3, townsy: 2, pinchy: 2, bolt: 2 };
const DEF = { grokbot: "x-ai/grok-4.20", musey: "meta/muse-spark-1.3", dotty: "openai/gpt-5.4-nano", sparkle: "google/gemini-3.5-flash-lite", deepy: "deepseek/deepseek-v4.1-flash", clawd: "anthropic/claude-haiku-5.5", kimmy: "moonshotai/kimi-k3", hermy: "nousresearch/hermes-4-405b", hunch: "minimax/minimax-m3", zozo: "qwen/qwen3.8-flash", townsy: "cohere/command-a-plus", pinchy: "openai/gpt-5.4-mini", bolt: "~openai/gpt-mini-latest" };
const EMOJI = /\p{Extended_Pictographic}/u;

for (const w of [390, 1280]) {
  const P = await mk({ width: w, height: 844 });
  await P.goto(S + "/");
  const nav = await P.locator(".nav-r > *").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.textContent.trim() || e.getAttribute("aria-label")));
  ok(`${w}: header has Bots right next to Leaderboard`, nav.indexOf("Bots") >= 0 && nav.indexOf("Leaderboard") === nav.indexOf("Bots") + 1, JSON.stringify(nav));
  const st = await P.locator(".nav-r a[href='/bots']").evaluate((e) => { const c = getComputedStyle(e), l = getComputedStyle(document.querySelector(".nav-r a[href='/leaderboard']")); return { same: e.className === "nav-a" && c.font === l.font && c.color === l.color, flat: c.backgroundColor === "rgba(0, 0, 0, 0)" && c.boxShadow === "none" && c.borderTopWidth === "0px" }; });
  ok(`${w}: Bots link is a flat text link, same style as Leaderboard`, st.same && st.flat, JSON.stringify(st));
  ok(`${w}: header fits on one line`, await P.locator(".nav").evaluate((e) => e.getBoundingClientRect().height < 70 && e.scrollWidth <= e.clientWidth + 1));
  await P.click(".nav-r a[href='/bots']"); await P.waitForURL(/\/bots$/);
  await P.waitForFunction(() => document.querySelectorAll(".tcard .av.pup").length === 13 && document.querySelector(".judge .av.pup"), null, { timeout: 20000 }).catch(() => {});
  if (w === 390) {
    const ids = await P.locator(".tcard").evaluateAll((els) => els.map((e) => e.dataset.id));
    ok("13 bot cards in roster order", ids.join() === ORDER, ids.join());
    ok("Jev is featured first, above the cards", await P.evaluate(() => { const j = document.querySelector(".judge"), t = document.querySelector(".tcards"); return !!j && !!t && j.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING; }));
    const jt = await P.locator(".judge").innerText();
    ok("Jev card: THE JUDGE, credits typesafe/jev-1.13, explains ~1.5 s live scoring", /THE JUDGE/.test(jt) && /typesafe\/jev-1\.13/.test(jt) && /1\.5 seconds/.test(jt) && /gavel/i.test(jt), jt.replace(/\s+/g, " ").slice(0, 160));
    ok("gateway link points to convex.dev/ai-gateway", (await P.locator("a[href='https://www.convex.dev/ai-gateway']").count()) >= 2);
    const cards = await P.locator(".tcard").evaluateAll((els) => els.map((e) => ({ id: e.dataset.id, name: e.querySelector("h3")?.textContent, tag: e.querySelector(".tc-tag")?.textContent, vibe: e.querySelector(".tc-vibe")?.textContent, model: e.querySelector(".tc-model")?.dataset.model, label: e.querySelector(".tc-model")?.textContent, alts: Number(e.querySelector(".tc-alts")?.dataset.alts), move: e.querySelectorAll("dd")[0]?.textContent })));
    ok("every card has name, persona line, vibe and signature move", cards.every((c) => c.name && c.tag?.length > 20 && /vibe|dealer/.test(c.vibe) && c.move));
    ok("default model per card matches the bot's default", cards.every((c) => c.model === DEF[c.id] && c.label), JSON.stringify(cards.filter((c) => c.model !== DEF[c.id]).map((c) => c.id)));
    ok("swap-in model count matches the allowlist", cards.every((c) => c.alts === ALTS[c.id]), JSON.stringify(cards.map((c) => [c.id, c.alts])));
    ok("all 13 puppets + Jev are rigged (full body)", (await P.locator(".tcard .av.pup[data-rig]").count()) === 13 && (await P.locator(".judge .av.pup[data-rig=jev]").count()) === 1);
    ok("puppets idle-animate", await P.evaluate(() => [...document.querySelectorAll(".tcard .pp, .judge .pp")].every((pp) => pp.getAnimations({ subtree: true }).some((a) => a.playState === "running"))));
    const tile = await P.locator(".tcard").evaluateAll((els) => els.map((e) => { const c = getComputedStyle(e), t = e.querySelector(".tc-art"), f = e.querySelector(".tc-art .av-face"), ts = getComputedStyle(t), fs = getComputedStyle(f);
      const cr = e.getBoundingClientRect(), tr = t.getBoundingClientRect();
      return { outer: parseFloat(c.borderTopLeftRadius), pad: parseFloat(c.paddingLeft), inner: parseFloat(ts.borderTopLeftRadius), even: ["TopLeft", "TopRight", "BottomLeft", "BottomRight"].every((k) => ts[`border${k}Radius`] === ts.borderTopLeftRadius && fs[`border${k}Radius`] === ts.borderTopLeftRadius),
        ring: fs.boxShadow, border: ts.borderTopWidth, clip: ts.overflow, insetL: Math.round(tr.left - cr.left), insetR: Math.round(cr.right - tr.right), insetT: Math.round(tr.top - cr.top) }; }));
    ok("art tile: uniform radius = card radius - padding, no partial ring/border, clips cleanly, even 8px-grid inset", tile.every((t) => t.inner === t.outer - t.pad && t.even && t.ring === "none" && t.border === "0px" && t.clip === "hidden" && t.insetL === t.insetR && t.insetL === 10 && t.pad === 8), JSON.stringify(tile[0]));
    await P.locator(".tcard[data-id=grokbot]").screenshot({ path: `${OUT}/07-card-tile-closeup.png` });
    ok("no emoji on the page", !EMOJI.test(await P.locator("main").innerText()));
    ok("icons are inline line SVGs", (await P.locator(".bots svg.ic").count()) >= 13 * 3);
    await P.screenshot({ path: `${OUT}/01-bots-mobile.png`, fullPage: true });
    await P.screenshot({ path: `${OUT}/02-bots-mobile-top.png` });
    // Jev expand view: gavel bang -> score flip -> nod
    await P.locator(".judge .av.tap").click(); await P.waitForSelector(".xv-stage .pp", { timeout: 8000 });
    const cap = () => P.locator(".xv-cap").innerText();
    const c0 = await cap(); await P.waitForTimeout(500); await P.screenshot({ path: `${OUT}/03-jev-expand-gavel.png` });
    await P.locator(".xv-stage").click(); const c1 = await cap(); await P.waitForTimeout(450); await P.screenshot({ path: `${OUT}/04-jev-expand-score.png` });
    await P.locator(".xv-stage").click(); const c2 = await cap();
    ok("Jev expand: tap cycles gavel bang, score flip, nod", /Gavel bang/.test(c0) && /Score flip/.test(c1) && /Nod/.test(c2), [c0, c1, c2].join(" | "));
    ok("Jev's moves actually animate the gavel arm", await P.evaluate(() => document.querySelector(".xv-stage .pp-armL")?.getAnimations().length > 0));
    await P.keyboard.press("Escape"); ok("Esc closes the expand view", (await P.locator(".xv").count()) === 0);
    await P.locator(".tcard[data-id=pinchy] .av.tap").click(); await P.waitForSelector(".xv-stage .pp", { timeout: 8000 });
    const p0 = await cap(); await P.locator(".xv-stage").click(); const p1 = await cap();
    ok("bot card tap opens its expand view and taps cycle moves", /Pinchy/.test(p0) && p0 !== p1, `${p0} | ${p1}`);
    await P.locator(".xv-x").click();
  } else {
    await P.screenshot({ path: `${OUT}/05-bots-desktop.png`, fullPage: true });
    ok("desktop: cards in a multi-column grid", await P.locator(".tcards").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length >= 4));
  }
}
{ const D = await mk({ width: 1280, height: 900 }, { colorScheme: "dark" });
  await D.goto(S + "/bots"); await D.waitForFunction(() => document.querySelectorAll(".av.pup").length >= 14, null, { timeout: 20000 }).catch(() => {});
  await D.evaluate(() => { document.documentElement.dataset.theme = "dark"; }); await D.waitForTimeout(300);
  await D.screenshot({ path: `${OUT}/06-bots-desktop-dark.png` });
  await D.goto(S + "/"); await D.click("button.mode:has-text('Solo')");
  ok("Jev is not a playable bot (not in the picker)", (await D.locator(".chars [data-id=jev]").count()) === 0 && (await D.locator(".chars button.char:not(.rand)").count()) === 13); }

// ---------- every card's content stays inside its border (13 + Jev) at 390 / 768 / 1280, also while hovered ----------
for (const w of [390, 768, 1280]) {
  const P = await mk({ width: w, height: 900 });
  await P.goto(S + "/bots"); await P.waitForFunction(() => document.querySelectorAll(".av.pup").length >= 14, null, { timeout: 20000 }).catch(() => {});
  await P.locator(".tcard[data-id=clawd]").hover(); await P.waitForTimeout(250);
  const r = await P.evaluate(() => {
    const inside = (o, i) => i.left >= o.left - 0.5 && i.right <= o.right + 0.5 && i.top >= o.top - 0.5 && i.bottom <= o.bottom + 0.5;
    const cards = [...document.querySelectorAll(".tcard")].map((c) => { const o = c.getBoundingClientRect();
      const bad = [".tc-top", ".tc-art", ".tc-art .av", "h3", ".tc-tag", ".tc-stats"].filter((sel) => { const e = c.querySelector(sel); return !e || !inside(o, e.getBoundingClientRect()); });
      return { id: c.dataset.id, bad, tf: getComputedStyle(c).transform, innerTf: [...c.querySelectorAll(".tc-art, .tc-stats, .tc-top")].some((e) => getComputedStyle(e).transform !== "none"), clip: getComputedStyle(c).overflow }; });
    const j = document.querySelector(".judge"), jo = j.getBoundingClientRect();
    const jbad = [".judge-art .av", ".judge-t", ".judge h2", ".judge-cr"].filter((sel) => !inside(jo, j.querySelector(sel).getBoundingClientRect()));
    const grid = document.querySelector(".tcards").getBoundingClientRect();
    return { cards, jbad, over: [...document.querySelectorAll(".tcard")].filter((c) => !inside(grid, c.getBoundingClientRect())).map((c) => c.dataset.id) };
  });
  const bad = r.cards.filter((c) => c.bad.length || c.tf !== "none" || c.innerTf || c.clip !== "hidden");
  ok(`${w}: all 13 cards keep tile/art/stats inside their border, no tilt, overflow hidden (Clawd hovered)`, r.cards.length === 13 && !bad.length && !r.over.length, JSON.stringify(bad.slice(0, 2)));
  ok(`${w}: Jev's card keeps its art and text inside its border`, !r.jbad.length, r.jbad.join());
  if (w === 1280) await P.locator(".tcards").screenshot({ path: `${OUT}/08-cards-desktop-hover.png` });
  if (w === 768) await P.screenshot({ path: `${OUT}/09-bots-tablet.png`, fullPage: true });
}

// ---------- SEO ----------
const html = await (await fetch(`${S}/bots`)).text();
ok("/bots server HTML: title, description, canonical", /<title>Meet the bots · Bot Battle<\/title>/.test(html) && /rel="canonical" href="[^"]+\/bots"/.test(html) && /name="description" content="Meet all 13/.test(html));
const og = html.match(/property="og:image" content="([^"]+)"/)?.[1];
const ogr = og ? await fetch(og) : null;
ok("/bots has its own OG image (1200x630 jpeg, served)", /\/og\/bots\.v1\.jpg$/.test(og ?? "") && ogr?.status === 200 && /image\/jpeg/.test(ogr.headers.get("content-type") ?? ""), og);
ok("/bots server HTML lists the bots and Jev for crawlers", /<li><b>Grokbot<\/b>/.test(html) && /THE JUDGE|the judge/i.test(html) && /convex\.dev\/ai-gateway/.test(html));
const sm = await (await fetch(`${S}/sitemap.xml`)).text();
ok("sitemap has /bots", sm.includes(`${S}/bots</loc>`));
const llms = await (await fetch(`${S}/llms.txt`)).text();
ok("llms.txt has /bots, the judge and bot cards", llms.includes(`${S}/bots`) && /## The judge/.test(llms) && /typesafe\/jev-1\.13/.test(llms) && /\*\*Pinchy\*\*/.test(llms) && /ai-gateway/.test(llms));
const ag = await (await fetch(`${S}/agents.md`)).text();
ok("agents.md lists /bots", ag.includes(`\`${S}/bots\``));

ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await b.close();
const f = results.filter((r) => !r.pass);
console.log(`\n${results.length - f.length}/${results.length} passed`);
process.exit(f.length ? 1 : 0);
