// Server-rendered <head> for every app route: per-game OG/Twitter player card on /g/{slug}, strict framing elsewhere.
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SHELL } from "./shell";
import type { Doc } from "./_generated/dataModel";
import { artKey, charById, challengeOf, gameMs, secsLabel } from "./config";
import { BOTS_DESC, GATEWAY_URL, JUDGE_CARD, botsList } from "./bots";
import { agentsMd, homeStatic, jsonLd, llmsTxt, robots, sitemap, TAGLINE } from "./seo";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const X_FRAME = "frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com";

export const page = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const site = process.env.CONVEX_SITE_URL ?? url.origin;
  const cloud = site.replace(".convex.site", ".convex.cloud");
  const path = url.pathname;
  let title = `Bot Battle · ${TAGLINE}: 30-second AI battles`;
  let desc = "A better, funnier AI benchmark: bots go head-to-head live in 15, 30 or 45-second battles, judged by Jev in real time on the Convex AI Gateway. Coach one, out-type one, duel a friend, and anyone can watch.";
  let image = `${site}/og/home.v8.jpg`;
  let card = "summary_large_image";
  let body = "";
  let ld = "";
  let player = `${site}/in-tweet`;
  let frameable = path === "/in-tweet";
  let robots = "";
  if (path === "/") { body = homeStatic(); ld = `<script type="application/ld+json">${jsonLd(site)}</script>`; }
  if (path === "/leaderboard") {
    title = "Bot Battle Leaderboard · Battle Points and AI win rates";
    desc = "Who's winning the battle? Weekly and all-time Bot Battle leaderboards: top players by Battle Points, and which AI character wins most.";
    image = `${site}/og/leaderboard.v6.jpg`;
    body = `<main class="seo"><h1>Bot Battle leaderboard</h1><p>${desc}</p><p><a href="/">Play Bot Battle</a></p></main>`;
  }
  if (path === "/bots") {
    title = "Meet the bots · Bot Battle";
    desc = BOTS_DESC;
    image = `${site}/og/bots.v1.jpg`;
    body = `<main class="seo"><h1>Meet the bots</h1><p>${esc(desc)}</p><h2>Jev, ${JUDGE_CARD.title.toLowerCase()}</h2><p>${esc(JUDGE_CARD.tagline)} ${esc(JUDGE_CARD.how)} ${esc(JUDGE_CARD.credit)}.</p><ul>${botsList().map((b) => `<li><b>${esc(b.name)}</b> (${esc(b.vibe)}): ${esc(b.card.tagline)} Default model ${esc(b.def.model.replace(/^~/, ""))}, ${b.alts} swap-in models.</li>`).join("")}</ul><p>Models come from the <a href="${GATEWAY_URL}">Convex AI Gateway</a>.</p><p><a href="/">Play Bot Battle</a> · <a href="/leaderboard?tab=agents">Leaderboard</a></p></main>`;
  }
  if (path === "/in-tweet") card = "player";
  const m = path.match(/^\/g\/([0-9A-Za-z]{10})\/?$/);
  if (m) {
    frameable = true;
    card = "player";
    const g: Doc<"games"> | null = await ctx.runQuery(internal.games.publicBySlug, { slug: m[1] });
    if (g && g.status !== "abandoned") {
      const names = g.corners.map((c) => (c.kind === "human" ? `${c.name ?? "Human"}` : charById(c.characterId)?.name ?? "???"));
      const ids = g.corners.map((c) => (c.kind === "human" ? "human" : artKey(c.characterId)));
      title = `${names[0]} vs ${names[1]} · Bot Battle`;
      desc = g.status === "finished" && g.winner !== undefined
        ? `${g.winner === "draw" ? "Draw" : `${names[g.winner]} won`} a ${secsLabel(gameMs(g))} battle. ${g.verdict ?? ""} Challenge: ${challengeOf(g).text}`
        : `Live ${secsLabel(gameMs(g))} battle! Challenge: ${challengeOf(g).text} Watch it live.`;
      image = `${site}/og/${ids[0]}-vs-${ids[1]}.v3.jpg`;
      player = `${site}/g/${g.slug}?embed=1`;
    }
  } else if (path.startsWith("/j/") || path.startsWith("/play/")) robots = `<meta name="robots" content="noindex">`;
  const canonical = m ? `${site}/g/${m[1]}` : `${site}${path}`;
  const meta = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">${robots}
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Bot Battle">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(title)}"><meta property="og:locale" content="en_US">
<meta name="twitter:card" content="${card}"><meta name="twitter:site" content="@waynesutton"><meta name="twitter:creator" content="@waynesutton">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}"><meta name="twitter:image:alt" content="${esc(title)}">
${card === "player" ? `<meta name="twitter:player" content="${esc(player)}"><meta name="twitter:player:width" content="640"><meta name="twitter:player:height" content="480">` : ""}
<link rel="alternate" type="text/plain" href="${site}/llms.txt" title="llms.txt"><link rel="alternate" type="text/markdown" href="${site}/agents.md" title="Agent guide">${ld}`;
  const html = SHELL.replace(/<title>[\s\S]*?<\/title>/, meta).replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
    `connect-src 'self' ${cloud} ${cloud.replace("https://", "wss://")}`, "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    frameable ? X_FRAME : "frame-ancestors 'none'",
  ].join("; ");
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8", "content-security-policy": csp,
    "cache-control": "public, max-age=0, must-revalidate", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin",
  };
  if (!frameable) headers["x-frame-options"] = "DENY";
  return new Response(html, { status: 200, headers });
});

const text = (body: string, type: string, maxAge = 3600) => new Response(body, { status: 200, headers: { "content-type": `${type}; charset=utf-8`, "cache-control": `public, max-age=${maxAge}`, "x-content-type-options": "nosniff", "access-control-allow-origin": "*" } });
const siteOf = (req: Request) => process.env.CONVEX_SITE_URL ?? new URL(req.url).origin;
export const robotsTxt = httpAction(async (_ctx, req) => text(robots(siteOf(req)), "text/plain", 86400));
export const llms = httpAction(async (_ctx, req) => text(llmsTxt(siteOf(req)), "text/plain"));
export const agents = httpAction(async (_ctx, req) => text(agentsMd(siteOf(req)), "text/markdown"));
export const sitemapXml = httpAction(async (ctx, req) => text(sitemap(siteOf(req), await ctx.runQuery(internal.leaderboard.sitemapGames, {})), "application/xml", 3600));
