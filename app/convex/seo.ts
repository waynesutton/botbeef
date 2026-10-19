// One source of truth for crawlable copy: home page text, JSON-LD, FAQ, llms.txt, agents.md, robots, sitemap.
import { ROSTER as CHARACTERS, MODES, DURATIONS, DEFAULT_MS } from "./config";
import { GATEWAY_URL, JUDGE_CARD, botsMd } from "./bots";

const LENS = DURATIONS.map((d) => d / 1000).join(", ").replace(/, (\d+)$/, " or $1"); // "15, 30 or 45"
const DEF = DEFAULT_MS / 1000;
export const TAGLINE = "Bots on the mic, judged live";
export const ABOUT = `Bot Battle is a free browser game where AI characters battle in quick rounds of ${LENS} seconds (${DEF} by default). You get a challenge, then you either coach an AI with a live prompt or type your own answer against one. Every word you type changes the fight: the AI rewrites its answer as you go, and Jev, a decision model on the Convex AI Gateway, scores both sides live every 1.5 seconds. Anyone can watch any game from its link.`;
export const BENCH = "Bot Battle is a better, funnier way to benchmark AI models. Static leaderboards hand you a frozen score from a test run weeks ago. Here models go head-to-head live on the same challenge and the same clock, Jev judges every answer in real time, and a crowd can watch each round play out or replay it later. You see how a model handles pressure, coaching and a rival, not just a number.";
export const PELE = "Pele mode turns every answer into a live diagram. Flip it on under Start and each finished word you type, or your bot writes, draws or grows a mindmap: every short clause becomes a branch off the question. Jev still scores the words, plus a small structure score (about 15%) for distinct, well-organized branches. Diagrams are drawn by Pele (pele.run), the open-source Mermaid renderer from obsidianmd.";
export const PELE_FAQ = `${PELE} Pele is MIT licensed: https://pele.run and https://github.com/obsidianmd/pele.`;
export const HOW = [
  "Enter a display name. No sign-up; your browser remembers you.",
  "Pick a mode: Solo, You vs Agent, Duel or Exhibition.",
  "Pick your character, or let AI pick a rival.",
  "Pick a length under the Start button: 15, 30 or 45 seconds (30 by default).",
  "Read the challenge and type until the clock runs out. Your bot and the scores react to every word.",
  "Lock in early or let the clock run out. Jev scores the final answers and picks a winner.",
  "Share the watch link. Wins earn Battle Points on the weekly leaderboard.",
];
export const FAQ: { q: string; a: string }[] = [
  { q: "What is Bot Battle?", a: ABOUT },
  { q: "How do I play Bot Battle?", a: HOW.join(" ") },
  { q: "Is Bot Battle free? Do I need an account?", a: "Yes, it's free and there's no sign-up. Your name and stats are tied to your browser." },
  { q: "How long is a game?", a: `You pick: ${LENS} seconds, ${DEF} by default. Battle Points are the same for every length.` },
  { q: "Is Bot Battle an AI benchmark?", a: BENCH },
  { q: "How is a game scored?", a: "Jev, a decision model from TypeSafe served through the Convex AI Gateway, scores both answers against the challenge every 1.5 seconds and again at the end. The higher final score wins; ties can be broken by Jev's head-to-head pick." },
  { q: "What is Pele mode?", a: PELE_FAQ },
  { q: "What are the game modes?", a: MODES.map((m) => `${m.name}: ${m.blurb}`).join(" ") },
  { q: "Which AI characters are in Bot Battle?", a: `${CHARACTERS.map((c) => `${c.name} (${c.vibe}, powered by ${c.model.replace(/^~/, "")})`).join(", ")}. They are fan-made parody characters, not affiliated with or endorsed by any AI company.` },
  { q: "Can I watch or share a game?", a: "Yes. Every game has a public watch link at /g/{id} that works live and as a replay afterwards, and it shows a playable card when posted on X. Duel invite links (/j/...) are single-use and private." },
  { q: "Who built Bot Battle?", a: "Wayne Sutton (waynesutton.ai), built with Convex: database, realtime sync, static hosting and the Convex AI Gateway." },
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Server-rendered home copy inside #root; React replaces it on mount, crawlers and answer engines read it. */
export const homeStatic = () => `<main class="seo"><h1>Bot Battle: ${TAGLINE}</h1><p>${esc(ABOUT)}</p>
<h2>A better AI benchmark</h2><p>${esc(BENCH)}</p>
<h2>How to play</h2><ol>${HOW.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>
<h2>Pele mode</h2><p>${esc(PELE)}</p>
<h2>Modes</h2><ul>${MODES.map((m) => `<li><b>${esc(m.name)}</b>: ${esc(m.blurb)}</li>`).join("")}</ul>
<h2>FAQ</h2>${FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}
<p><a href="/">Play Bot Battle</a> · <a href="/bots">Meet the bots</a> · <a href="/leaderboard?tab=agents">Leaderboard</a></p></main>`;

export const jsonLd = (site: string) => JSON.stringify([
  {
    "@context": "https://schema.org", "@type": ["VideoGame", "WebApplication"], name: "Bot Battle", alternateName: "Bot Battle: bots on the mic, judged live",
    url: `${site}/`, image: `${site}/og/home.v8.jpg`, description: ABOUT, applicationCategory: "GameApplication", operatingSystem: "Any (web browser)",
    gamePlatform: "Web browser", genre: ["Party game", "Word game", "AI battle", "AI benchmark"], playMode: ["SinglePlayer", "MultiPlayer"], numberOfPlayers: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2 },
    inLanguage: "en", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "Wayne Sutton", url: "https://waynesutton.ai" },
    character: CHARACTERS.map((c) => ({ "@type": "Thing", name: c.name, description: `${c.vibe}, ${c.persona}` })),
  },
  { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
]).replace(/</g, "\\u003c");

export const robots = (site: string) => `User-agent: *\nAllow: /\nDisallow: /j/\nDisallow: /play/\n\nSitemap: ${site}/sitemap.xml\n`;

export const sitemap = (site: string, games: { slug: string; t: number }[]) => {
  const u = (loc: string, extra = "") => `<url><loc>${esc(loc)}</loc>${extra}</url>`;
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
    u(`${site}/`, "<changefreq>daily</changefreq><priority>1.0</priority>"),
    u(`${site}/leaderboard`, "<changefreq>hourly</changefreq><priority>0.8</priority>"),
    u(`${site}/bots`, "<changefreq>weekly</changefreq><priority>0.8</priority>"),
    u(`${site}/llms.txt`), u(`${site}/agents.md`),
    ...games.map((g) => u(`${site}/g/${g.slug}`, `<lastmod>${day(g.t)}</lastmod><priority>0.5</priority>`)),
  ].join("")}</urlset>\n`;
};

const modesMd = () => MODES.map((m) => `- **${m.name}** (\`${m.id}\`): ${m.blurb}`).join("\n");
const charsMd = () => CHARACTERS.map((c) => `- ${c.name}: ${c.vibe}, ${c.persona}. Model: ${c.model.replace(/^~/, "")}`).join("\n");

export const llmsTxt = (site: string) => `# Bot Battle

> ${TAGLINE}. ${ABOUT}

${BENCH}

## Key pages
- [Play](${site}/): pick a name, a mode and a character, pick 15, 30 or 45 seconds, then start the battle.
- [Leaderboard](${site}/leaderboard): weekly and all-time Battle Points, plus which AI wins most.
- [Meet the bots](${site}/bots): all ${CHARACTERS.length} bots as trading cards (vibe, signature move, default model, swap-in model count) and Jev, the judge.
- [Watch a game](${site}/g/{id}): public live view and replay for any game; posts on X as a playable card.
- [In-tweet player](${site}/in-tweet): compact 640x480 player card for X.
- [Agent guide](${site}/agents.md): how agents should describe, link and share Bot Battle games.

## How to play
${HOW.map((h, i) => `${i + 1}. ${h}`).join("\n")}

## Modes
${modesMd()}

## Pele mode
${PELE} Toggle it on the home page under the Start button; it works in every mode and is stored on the game.

## Characters (fan-made parodies, not affiliated with any AI company)
${charsMd()}

## The judge
Jev (${JUDGE_CARD.title}): ${JUDGE_CARD.how} ${JUDGE_CARD.credit}.

## Bot cards (${site}/bots)
${botsMd()}
Models come from the Convex AI Gateway (${GATEWAY_URL}). Each bot's swap-in models are same-family gateway models that work with reasoning off; a player can pick one per game.

## FAQ
${FAQ.map((f) => `- **${f.q}** ${f.a}`).join("\n")}

## Credits
Built by Wayne Sutton (https://waynesutton.ai) with Convex (https://convex.dev). Scoring by Jev from TypeSafe via the Convex AI Gateway. Pele mode diagrams by Pele (https://pele.run, https://github.com/obsidianmd/pele, MIT).
`;

export const agentsMd = (site: string) => `# Bot Battle: guide for AI agents

Bot Battle (${site}) is an AI battle game with ${LENS}-second rounds (${DEF} s default). ${ABOUT}

${BENCH}

## URLs
| URL | What it is | Share it? |
| --- | --- | --- |
| \`${site}/\` | Home. Start a game (name, mode, character). | Yes |
| \`${site}/g/{id}\` | Public watch page for one game, live or replay. \`{id}\` is 10 letters/digits. Shows an X player card. | Yes |
| \`${site}/g/{id}?embed=1\` | Compact 640x480 embed of that game (used by the X player card). | Yes |
| \`${site}/in-tweet\` | General in-tweet player card. | Yes |
| \`${site}/leaderboard\` | Weekly/all-time leaderboard and AI win rates. | Yes |
| \`${site}/bots\` | Meet the bots: trading cards for every bot (default model, swap-in model count) and Jev, the judge. | Yes |
| \`${site}/j/{token}\` | Single-use Duel invite for one person. | Only to the invited person |
| \`${site}/play/{id}\` | A player's own seat (tied to their browser). | No: share \`/g/{id}\` instead |

## Linking to games
- To show someone a game, link \`${site}/g/{id}\`. It works for anyone, needs no account, and updates live.
- To post on X, use \`https://twitter.com/intent/tweet?text={text}&url=${encodeURIComponent(`${site}/g/{id}`)}\`. X shows that game's player card. For the general card, use \`url=${site}/in-tweet\`.
- Never share \`/play/\` or \`/j/\` links publicly. Seats and invites are private.

## Modes
${modesMd()}

## Pele mode
${PELE} A game's watch page \`/g/{id}\` shows both mindmaps after the reveal (a Duel hides each side's map until then, like the prompts).

## Characters
${charsMd()}

## Rules for agents
- There is no public write API. Games are started by people in a browser. Agents can read the pages, link them and describe them.
- Be respectful: characters are fan-made parodies, not official products of any AI company.
- Machine-readable summary: ${site}/llms.txt. Sitemap: ${site}/sitemap.xml.
`;
