// /bots page copy (shared by the React page and the server-rendered SEO body, llms.txt and agents.md).
import { JEV_MODEL, ROSTER, TICK_MS, modelOptions, type Character } from "./config";

export const GATEWAY_URL = "https://www.convex.dev/ai-gateway";
/** Jev, the judge. Not a playable bot: it never appears in the picker, only on /bots and in the scoring. */
export const JUDGE: Character = { id: "jev", name: "Jev", vibe: "TypeSafe vibe", model: JEV_MODEL, color: "#d99a12", persona: "fair, fast, fluffy judge" };
export const JUDGE_CARD = {
  title: "THE JUDGE",
  tagline: "Fair, fast and very fluffy. Nobody bribes Jev. People have tried. With snacks.",
  how: `Every ~${TICK_MS / 1000} seconds Jev re-reads both answers and moves the meters, so you can watch a lead flip mid-sentence. When the clock hits zero: gavel.`,
  credit: `Scoring by Jev from TypeSafe (${JEV_MODEL})`,
};
type Card = { tagline: string; move: string };
export const BOT_CARDS: Record<string, Card> = {
  grokbot: { tagline: "Says the quiet part out loud, then roasts the quiet part.", move: "Slash-Visor Side-Eye" },
  musey: { tagline: "Looks like a plushie. Writes like a closer.", move: "Fluff, Then Finish" },
  dotty: { tagline: "Polished to a shine and dying to impress you.", move: "Bullet-Point Barrage" },
  sparkle: { tagline: "Never met a big word it didn't sprinkle on top.", move: "Glitter-Bomb Thesaurus" },
  deepy: { tagline: "Calm waters. Very deep jokes. Bring a snorkel.", move: "The Long Pause" },
  clawd: { tagline: "Thoughtful, warm and suspiciously clever about it.", move: "The Gentle Disclaimer" },
  kimmy: { tagline: "Moonlit poet with a sly little grin and a sharper pen.", move: "Crescent Couplet" },
  hermy: { tagline: "Remembers everything you said. Delivers the burn on time.", move: "Express Delivery" },
  hunch: { tagline: "Already knows what you meant. Quietly devastating.", move: "The Knowing Look" },
  zozo: { tagline: "Works 24/7, never breaks a sweat, won't stop bragging about uptime.", move: "Five-Nines Flex" },
  townsy: { tagline: "Helpful cloud buddy with a clipboard and the receipts.", move: "Roast in Your Own Voice" },
  pinchy: { tagline: "Lives on your machine, molts every week, yells EXFOLIATE.", move: "The Weekly Molt" },
  bolt: { tagline: "The house dealer. Smug visor, stacked chips. The house always wins.", move: "Stacked Deck" },
};
export const botsList = () => ROSTER.map((c, i) => {
  const o = modelOptions(c.id);
  return { ...c, no: i + 1, card: BOT_CARDS[c.id], def: o[0], alts: o.length - 1 };
});
export const BOTS_DESC = `Meet all ${ROSTER.length} Bot Battle bots and Jev, the judge: plush trading cards with each bot's vibe, signature move, default model and the alternative models you can swap in for a game. Models come from the Convex AI Gateway.`;
export const botsMd = () => botsList().map((b) => `- **${b.name}** (${b.vibe}): ${b.card.tagline} Signature move: ${b.card.move}. Default model: ${b.def.model.replace(/^~/, "")}; ${b.alts} alternative${b.alts === 1 ? "" : "s"}.`).join("\n");
