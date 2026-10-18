import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { agents, llms, page, robotsTxt, sitemapXml } from "./pages";

const http = httpRouter();
// Per-game share pages (OG + X player card) and app routes with explicit CSP, before the static catch-all.
for (const p of ["/", "/leaderboard", "/bots", "/in-tweet"]) http.route({ path: p, method: "GET", handler: page });
for (const p of ["/g/", "/j/", "/play/"]) http.route({ pathPrefix: p, method: "GET", handler: page });
// Crawlers, answer engines and agents.
http.route({ path: "/robots.txt", method: "GET", handler: robotsTxt });
http.route({ path: "/sitemap.xml", method: "GET", handler: sitemapXml });
http.route({ path: "/llms.txt", method: "GET", handler: llms });
for (const p of ["/agents.md", "/AGENTS.md"]) http.route({ path: p, method: "GET", handler: agents });
registerStaticRoutes(http, components.staticHosting);
export default http;
