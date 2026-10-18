// E2E: meta/OG/JSON-LD per route, crawlable home text, robots/sitemap/llms.txt/agents.md, OG image size.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const results = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const get = async (p) => { const r = await fetch(S + p, { headers: { "user-agent": "Googlebot/2.1" } }); return { status: r.status, type: r.headers.get("content-type") ?? "", body: await r.text() }; };
const tag = (html, re) => html.match(re)?.[1];
const meta = (html, k) => tag(html, new RegExp(`<meta (?:name|property)="${k}" content="([^"]*)"`));

const home = await get("/");
ok("home: title", /Bot Battle/.test(tag(home.body, /<title>([^<]*)<\/title>/) ?? ""), tag(home.body, /<title>([^<]*)<\/title>/));
ok("home: description", (meta(home.body, "description") ?? "").length > 80);
ok("home: canonical", tag(home.body, /<link rel="canonical" href="([^"]*)"/) === `${S}/`);
ok("home: og:image v8 1200x630", meta(home.body, "og:image") === `${S}/og/home.v8.jpg` && meta(home.body, "og:image:width") === "1200");
ok("home: twitter:card summary_large_image", meta(home.body, "twitter:card") === "summary_large_image");
const ld = [...home.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1]));
ok("home: JSON-LD VideoGame + WebApplication", ld.some((x) => [x["@type"]].flat().includes("VideoGame") && [x["@type"]].flat().includes("WebApplication")));
ok("home: JSON-LD FAQPage", ld.some((x) => x["@type"] === "FAQPage" && x.mainEntity.length >= 5), String(ld.find((x) => x["@type"] === "FAQPage")?.mainEntity.length));
ok("home: crawlable static text (no JS)", /<div id="root"><main class="seo"><h1>Bot Battle/.test(home.body) && /How to play/.test(home.body) && /What is Bot Battle\?/.test(home.body));
ok("home: links llms.txt + agents.md", home.body.includes(`${S}/llms.txt`) && home.body.includes(`${S}/agents.md`));

const lb = await get("/leaderboard");
ok("leaderboard: own title/desc/canonical", /Leaderboard/.test(tag(lb.body, /<title>([^<]*)<\/title>/) ?? "") && tag(lb.body, /<link rel="canonical" href="([^"]*)"/) === `${S}/leaderboard`);
ok("leaderboard: summary_large_image + leaderboard OG", meta(lb.body, "twitter:card") === "summary_large_image" && meta(lb.body, "og:image") === `${S}/og/leaderboard.v6.jpg`);

const sm = await get("/sitemap.xml");
const slugs = [...sm.body.matchAll(/\/g\/([0-9A-Za-z]{10})</g)].map((m) => m[1]);
ok("sitemap.xml: xml with home, leaderboard, games", sm.status === 200 && /xml/.test(sm.type) && sm.body.includes(`<loc>${S}/</loc>`) && sm.body.includes(`${S}/leaderboard`) && slugs.length > 0, `${slugs.length} games`);
const g = await get(`/g/${slugs[0]}`);
ok("game page: keeps per-game OG image + player card", /\/og\/[a-z]+-vs-[a-z]+\.v3\.jpg/.test(meta(g.body, "og:image") ?? "") && meta(g.body, "twitter:card") === "player" && meta(g.body, "twitter:player") === `${S}/g/${slugs[0]}?embed=1`, meta(g.body, "og:image"));
ok("game page: canonical /g/{slug}", tag(g.body, /<link rel="canonical" href="([^"]*)"/) === `${S}/g/${slugs[0]}`);
const it = await get("/in-tweet");
ok("in-tweet: player card", meta(it.body, "twitter:card") === "player" && meta(it.body, "twitter:player") === `${S}/in-tweet`);
const pl = await get(`/play/${slugs[0]}`);
ok("/play/ is noindex", /<meta name="robots" content="noindex">/.test(pl.body));

const rb = await get("/robots.txt");
ok("robots.txt", rb.status === 200 && /User-agent: \*/.test(rb.body) && /Disallow: \/j\//.test(rb.body) && rb.body.includes(`Sitemap: ${S}/sitemap.xml`));
const lt = await get("/llms.txt");
ok("llms.txt served", lt.status === 200 && /text\/plain/.test(lt.type) && /^# Bot Battle/.test(lt.body) && /## Modes/.test(lt.body) && lt.body.includes(`${S}/g/{id}`), `${lt.body.length} chars`);
const am = await get("/agents.md"), AM = await get("/AGENTS.md");
ok("agents.md served (and /AGENTS.md)", am.status === 200 && /markdown/.test(am.type) && /# Bot Battle: guide for AI agents/.test(am.body) && /twitter\.com\/intent\/tweet/.test(am.body) && !/x\.com\/intent\/post/.test(am.body) && AM.body === am.body, `${am.body.length} chars`);

// Rename: Bot Battle everywhere, no beef words or beef imagery, new plush-keyboard favicon, benchmark copy
const BEEF = /beef|🥩|🍖|burger/i;
ok("rename: home/leaderboard/game HTML, llms.txt and agents.md never say beef", ![home.body, lb.body, g.body.replace(/<meta (name|property)="(description|og:description|twitter:description)" content="[^"]*">/g, ""), it.body, lt.body, am.body].some((t) => BEEF.test(t)));
ok("rename: og:site_name Bot Battle", meta(home.body, "og:site_name") === "Bot Battle" && meta(g.body, "og:site_name") === "Bot Battle");
ok("rename: Battle Points (leaderboard meta)", /Battle Points/.test(meta(lb.body, "description") ?? ""));
ok("benchmark copy: home static text, FAQ and llms.txt", /better, funnier way to benchmark AI models/.test(home.body) && /Is Bot Battle an AI benchmark\?/.test(home.body) && /benchmark/.test(lt.body));
const fav = await fetch(`${S}/favicon.v4.svg`), fpng = await fetch(`${S}/favicon.v4.png`), ati = await fetch(`${S}/apple-touch-icon.v4.png`);
ok("monochrome favicon (svg + png) and apple-touch icon served and linked", fav.status === 200 && fpng.status === 200 && ati.status === 200 && /href="\/favicon\.v4\.svg"/.test(home.body) && /href="\/apple-touch-icon\.v4\.png"/.test(home.body), `${fav.status}/${fpng.status}/${ati.status}`);
const b = await chromium.launch(); const p = await b.newPage();
for (const im of ["home.v8.jpg", "leaderboard.v6.jpg", "grokbot-vs-pinchy.v3.jpg"]) {
  await p.goto(`${S}/og/${im}`);
  const d = await p.evaluate(() => [document.images[0].naturalWidth, document.images[0].naturalHeight]);
  ok(`OG ${im} is 1200x630`, d[0] === 1200 && d[1] === 630, d.join("x"));
}
await b.close();
const fails = results.filter((r) => !r.pass);
console.log(JSON.stringify({ pass: results.length - fails.length, total: results.length }));
