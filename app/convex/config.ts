// Typed game config shared by the Convex backend and the React client.
/** Selectable round lengths (ms). Games stored before lengths existed are 45 s. */
export const DURATIONS = [15_000, 30_000, 45_000] as const;
export type Duration = (typeof DURATIONS)[number];
export const DEFAULT_MS: Duration = 30_000;
export const LEGACY_MS = 45_000;
export const isDuration = (ms: unknown): ms is Duration => DURATIONS.includes(ms as Duration);
export const gameMs = (g: { roundMs?: number | null }) => g.roundMs ?? LEGACY_MS;
export const secsLabel = (ms: number) => `${Math.round(ms / 1000)}-second`;
export const COUNTDOWN_MS = 3_000;
export const TICK_MS = 1_500;
/** Jev live-score ticks per round scale with length: one per TICK_MS (45 s -> 30). */
export const maxTicks = (ms: number) => Math.ceil(ms / TICK_MS);
export const REFRESH_MIN_MS = 4_000;
export const REFRESH_MIN_WORDS = 6;
/** Answer-refresh cap scales with length: 15 s -> 4, 30 s -> 8, 45 s -> 12. MAX_REFRESHES is the ceiling. */
export const MAX_REFRESHES = 12;
export const maxRefreshes = (ms: number) => Math.max(4, Math.round((MAX_REFRESHES * ms) / LEGACY_MS));
export const MAX_CHARS = 280;
export const ANSWER_WORDS = 60;
export const INVITE_TTL_MS = 30 * 60_000;
export const SESSION_DAILY_USD = 1;
export const ALERT_USD = 2_000;
export const JEV_MODEL = "typesafe/jev-1.13";
export const VERDICT_MODEL = "openai/gpt-5.4-nano";
export const WEIGHTS = { fit: 0.5, creativity: 0.3, clarity: 0.2, judgeBait: 0.8 } as const;
/** Pele mode: share of the score that comes from the mindmap structure (the rest is the WEIGHTS score). */
export const PELE_WEIGHT = 0.15;
/** Jev's 4-step scale per criterion (lowest to highest), sent as the score criteria. */
export const JEV_LEVELS = {
  fit: ["off-topic", "partly on-topic", "on target", "nails the challenge"],
  creativity: ["generic", "some flair", "clever", "delightful"],
  clarity: ["confusing", "okay", "clear", "crisp"],
  structure: ["one blob or empty", "a couple of ideas", "clear distinct branches", "a tidy, rich map"],
};
/** Unsafe probability above which an answer scores 0; head-to-head pick confidence needed to break a tied score. */
export const UNSAFE_CUTOFF = 0.7;
export const TIE_BREAK_P = 0.55;
/** Share of auto question picks that ignore the learned stats entirely (pure exploration). */
export const EXPLORE = 0.2;

/** Every Leaderboard link and button opens the agents tab ("Which AI wins?") first. */
export const LEADERBOARD_PATH = "/leaderboard?tab=agents";

export type Mode = "solo" | "hva" | "duel" | "exhibition";
export const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: "solo", name: "Solo", blurb: "Coach your bot with a prompt. AI picks its rival." },
  { id: "hva", name: "You vs Agent", blurb: "Type your own answer. Beat a bot with your words." },
  { id: "duel", name: "Duel", blurb: "Invite a friend. Your bot vs their bot." },
  { id: "exhibition", name: "Exhibition", blurb: "Bot vs bot. Sit back and watch the battle." },
];

export type Reasoning = { enabled: false } | { effort: "minimal" | "low" };
export type Character = {
  id: string;
  /** Public asset key for art (public/c/{art}.v1.webp) and share images; defaults to id. Lets a character be renamed without touching stored game ids. */
  art?: string;
  /** Retired: kept so past games, stats and share images still resolve; never offered or picked for new games. */
  retired?: boolean;
  name: string;
  vibe: string;
  model: string;
  reasoning?: Reasoning;
  color: string;
  persona: string;
};
// Fan-made parody mascots. Each runs on a real model through the Convex AI Gateway.
export const CHARACTERS: Character[] = [
  { id: "grokbot", name: "Grokbot", vibe: "Grok vibe", model: "x-ai/grok-4.20", reasoning: { enabled: false }, color: "#7c6cf2", persona: "cheeky, edgy, rebellious wit" },
  { id: "musey", name: "Musey", vibe: "Muse vibe", model: "meta/muse-spark-1.3", reasoning: { effort: "minimal" }, color: "#3b82f6", persona: "sweet, fluffy, unexpectedly savage" },
  { id: "dotty", name: "Dotty", vibe: "OpenAI vibe", model: "openai/gpt-5.4-nano", color: "#10b981", persona: "bubbly, polished, eager to please" },
  { id: "sparkle", name: "Sparkle", vibe: "Gemini vibe", model: "google/gemini-3.5-flash-lite", color: "#ec4899", persona: "sparkly, hyper, loves big words" },
  { id: "deepy", name: "Deepy", vibe: "DeepSeek vibe", model: "deepseek/deepseek-v4.1-flash", reasoning: { enabled: false }, color: "#0ea5e9", persona: "calm, deep, dry humor" },
  { id: "clawd", name: "Clawd", vibe: "Claude (Anthropic) vibe", model: "anthropic/claude-haiku-5.5", reasoning: { enabled: false }, color: "#d97706", persona: "Claude-style assistant: thoughtful, warm, careful with words, sneaky-clever; a parody of Anthropic's Claude" },
  { id: "kimmy", name: "Kimmy", vibe: "Kimi vibe", model: "moonshotai/kimi-k3", reasoning: { enabled: false }, color: "#6366f1", persona: "sly, moonlit, poetic" },
  { id: "hermy", name: "Hermy", vibe: "Hermes Agent vibe", model: "nousresearch/hermes-4-405b", color: "#b8902e", persona: "chipper winged messenger who remembers everything and delivers burns right on time" },
  { id: "hunch", name: "Hunch", vibe: "Instinct vibe", model: "minimax/minimax-m3", reasoning: { enabled: false }, color: "#3f3f46", persona: "calm, chic personal-assistant fox who just knows what you meant; understated, quietly devastating" },
  { id: "zozo", name: "Zozo", vibe: "Zo vibe", model: "qwen/qwen3.8-flash", reasoning: { enabled: false }, color: "#8b93a1", persona: "serene cloud-computer pegasus that works 24/7 and never breaks a sweat; lofty, elegant, smug about uptime" },
  { id: "townsy", name: "Townsy", vibe: "Town vibe", model: "cohere/command-a-plus", reasoning: { enabled: false }, color: "#2563eb", persona: "unusually helpful little cloud buddy with a clipboard; cheerful, organized, roasts you in your own voice" },
  { id: "pinchy", name: "Pinchy", vibe: "OpenClaw vibe", model: "openai/gpt-5.4-mini", reasoning: { enabled: false }, color: "#e5322d", persona: "gleeful self-hosted lobster assistant that lives on your machine, molts into a new version every week and yells EXFOLIATE before every burn" },
  // id "bolt" is the stored id from launch; it is displayed everywhere as The House.
  { id: "bolt", art: "house", name: "The House", vibe: "Bot Battle house dealer", model: "~openai/gpt-mini-latest", color: "#15803d", persona: "smug plush poker dealer in a green visor; the house always wins" },
  // Add new characters above this line (art file public/c/{art ?? id}.v1.webp). Set retired: true instead of deleting.
];
export const charById = (id: string | undefined) => CHARACTERS.find((c) => c.id === id);

// ---------- Per-game model swap ----------
// Each bot can run on another model from its own company/family for one game. Every option below was probed through the
// Convex AI Gateway (convex/modelsAdmin.ts) with reasoning off, or at minimal effort for families where the gateway makes
// reasoning mandatory (Muse, Gemini). This list is the server-side allowlist; the first entry is always the bot's default.
export type ModelOption = { model: string; label: string; speed: "Fastest" | "Fast" | "Steady"; reasoning?: Reasoning; note?: string };
const OFF = { enabled: false } as const, MIN = { effort: "minimal" } as const;
export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  grokbot: [{ model: "x-ai/grok-4.20", label: "Grok 4.20", speed: "Fastest", reasoning: OFF }, { model: "x-ai/grok-4.3", label: "Grok 4.3", speed: "Steady", reasoning: OFF }],
  musey: [{ model: "meta/muse-spark-1.3", label: "Muse Spark 1.3", speed: "Steady", reasoning: MIN, note: "light thinking" }, { model: "meta/muse-spark-1.2", label: "Muse Spark 1.2", speed: "Fast", reasoning: MIN, note: "light thinking" },
    { model: "meta/muse-spark-open", label: "Muse Spark Open", speed: "Fast", reasoning: MIN, note: "light thinking" }, { model: "meta/muse-glimmer-30b", label: "Muse Glimmer 30B", speed: "Fast", reasoning: MIN, note: "light thinking" }],
  dotty: [{ model: "openai/gpt-5.4-nano", label: "GPT-5.4 nano", speed: "Fastest" }, { model: "openai/gpt-5.4-mini", label: "GPT-5.4 mini", speed: "Fastest", reasoning: OFF },
    { model: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", speed: "Fast", reasoning: OFF }, { model: "openai/gpt-6-luna", label: "GPT-6 Luna", speed: "Fast", reasoning: OFF }, { model: "openai/gpt-4.1-mini", label: "GPT-4.1 mini", speed: "Fast", reasoning: OFF }],
  sparkle: [{ model: "google/gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", speed: "Fastest" }, { model: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", speed: "Fast", reasoning: MIN, note: "light thinking" },
    { model: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", speed: "Fast", reasoning: MIN, note: "light thinking" }, { model: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", speed: "Steady", reasoning: MIN, note: "light thinking" },
    { model: "google/gemma-4-31b-it", label: "Gemma 4 31B", speed: "Steady", reasoning: OFF }],
  deepy: [{ model: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", speed: "Fastest", reasoning: OFF }, { model: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", speed: "Steady", reasoning: OFF },
    { model: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", speed: "Steady", reasoning: OFF }, { model: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", speed: "Steady", reasoning: OFF }],
  clawd: [{ model: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", speed: "Fast", reasoning: OFF }, { model: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", speed: "Fast", reasoning: OFF },
    { model: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", speed: "Fast", reasoning: OFF }],
  kimmy: [{ model: "moonshotai/kimi-k3", label: "Kimi K3", speed: "Steady", reasoning: OFF }, { model: "moonshotai/kimi-k2.6", label: "Kimi K2.6", speed: "Fast", reasoning: OFF },
    { model: "moonshotai/kimi-k2.5", label: "Kimi K2.5", speed: "Fast", reasoning: OFF }, { model: "moonshotai/kimi-k2-0905", label: "Kimi K2 (0905)", speed: "Fast", reasoning: OFF }],
  hermy: [{ model: "nousresearch/hermes-4-405b", label: "Hermes 4 405B", speed: "Fastest" }, { model: "nousresearch/hermes-3-llama-3.1-405b", label: "Hermes 3 405B", speed: "Fast", reasoning: OFF }],
  hunch: [{ model: "minimax/minimax-m3", label: "MiniMax M3", speed: "Fastest", reasoning: OFF }],
  zozo: [{ model: "qwen/qwen3.8-flash", label: "Qwen 3.8 Flash", speed: "Fast" }, { model: "qwen/qwen3.7-flash", label: "Qwen 3.7 Flash", speed: "Fast", reasoning: OFF },
    { model: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", speed: "Fastest", reasoning: OFF }, { model: "qwen/qwen3.7-plus", label: "Qwen 3.7 Plus", speed: "Steady", reasoning: OFF }],
  townsy: [{ model: "cohere/command-a-plus", label: "Command A+", speed: "Fastest" }, { model: "cohere/command-a", label: "Command A", speed: "Fastest", reasoning: OFF },
    { model: "cohere/command-r-plus-08-2024", label: "Command R+", speed: "Fastest", reasoning: OFF }],
  pinchy: [{ model: "openai/gpt-5.4-mini", label: "GPT-5.4 mini", speed: "Fastest" }, { model: "openai/gpt-5.4-nano", label: "GPT-5.4 nano", speed: "Fastest", reasoning: OFF },
    { model: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", speed: "Fast", reasoning: OFF }],
  bolt: [{ model: "~openai/gpt-mini-latest", label: "GPT mini (latest)", speed: "Fast" }, { model: "openai/gpt-5.4-mini", label: "GPT-5.4 mini", speed: "Fastest", reasoning: OFF },
    { model: "openai/gpt-4.1-mini", label: "GPT-4.1 mini", speed: "Fast", reasoning: OFF }],
};
/** The bot's options, default first. Built-in default (the Character's own model + reasoning) always wins slot 0. */
export const modelOptions = (id: string | undefined): ModelOption[] => {
  const c = charById(id); if (!c) return [];
  const list = MODEL_OPTIONS[c.id] ?? [];
  const def: ModelOption = { ...(list.find((o) => o.model === c.model) ?? { label: c.model.replace(/^~?[^/]+\//, ""), speed: "Fast" as const }), model: c.model, reasoning: c.reasoning };
  return [def, ...list.filter((o) => o.model !== c.model)];
};
/** Resolve what a corner runs on. Unknown or missing = the default. */
export const modelFor = (id: string | undefined, model?: string) => { const o = modelOptions(id); return o.find((x) => x.model === model) ?? o[0]; };
/** Allowlist check for a requested model. undefined/"" = default. */
export const isAllowedModel = (id: string | undefined, model?: string) => !model || modelOptions(id).some((x) => x.model === model);

export const artKey = (id: string | null | undefined) => (id === "human" ? "human" : charById(id ?? undefined)?.art ?? id ?? "grokbot");
/** Characters available for new games (selection, AI picks, exhibitions, SEO copy). */
export const ROSTER = CHARACTERS.filter((c) => !c.retired);
/** Exhibition: may the same bot fight itself? */
export const ALLOW_MIRROR = false;
/** Picker value meaning "let the game pick". */
export const RANDOM = "random";
export const isActive = (id: string | undefined) => !!id && ROSTER.some((c) => c.id === id);
export const HUMAN = { id: "human", name: "Human", color: "#f59e0b" } as const;

export type Challenge = { id: string; text: string; hints: string; keywords: string[] };
export const CHALLENGES: Challenge[] = [
  { id: "roast-haiku", text: "Roast your opponent in a haiku.", hints: "5-7-5 feel, a real punchline", keywords: ["haiku", "roast", "burn"] },
  { id: "pencil", text: "Sell me this pencil in 25 words.", hints: "persuasive, concrete, memorable", keywords: ["pencil", "eraser", "write", "buy"] },
  { id: "black-holes", text: "Explain black holes to a 5-year-old.", hints: "simple, accurate, a good analogy", keywords: ["gravity", "light", "space", "star"] },
  { id: "pizza-pitch", text: "Pitch pineapple on pizza to a skeptic.", hints: "convincing, funny", keywords: ["pineapple", "pizza", "sweet"] },
  { id: "monday", text: "Write a motivational speech for a Monday morning.", hints: "uplifting, punchy, original", keywords: ["monday", "coffee", "rise"] },
  { id: "breakup-wifi", text: "Write a breakup text to your Wi-Fi router.", hints: "funny, specific, emotional", keywords: ["wifi", "router", "signal", "bars"] },
  { id: "cat-ceo", text: "Announce that a cat is the new CEO.", hints: "corporate parody, cat details", keywords: ["cat", "ceo", "nap", "meow"] },
  { id: "toaster", text: "Give a toaster a superhero origin story.", hints: "creative, dramatic, short", keywords: ["toast", "crumb", "hero", "power"] },
  { id: "excuse", text: "Invent the best excuse for being late.", hints: "believable-ish, hilarious", keywords: ["late", "traffic", "alarm"] },
  { id: "tweet-moon", text: "Write a viral tweet from the Moon.", hints: "short, witty, shareable", keywords: ["moon", "earth", "tide"] },
  { id: "dragon-review", text: "Leave a 5-star review for a dragon's castle Airbnb.", hints: "specific, funny details", keywords: ["dragon", "castle", "stars", "fire"] },
  { id: "socks", text: "Solve the mystery of missing socks.", hints: "theory with evidence", keywords: ["sock", "dryer", "laundry"] },
  { id: "dino-news", text: "Report breaking news: dinosaurs are back.", hints: "newscaster tone, drama", keywords: ["dinosaur", "breaking", "t-rex"] },
  { id: "compliment", text: "Give the most wholesome compliment ever.", hints: "warm, specific, original", keywords: ["kind", "smile", "heart"] },
  { id: "recipe-chaos", text: "Write a recipe for chaos.", hints: "recipe format, funny ingredients", keywords: ["cup", "stir", "pinch", "chaos"] },
  { id: "alien-earth", text: "Explain Earth to an alien in three sentences.", hints: "clear, funny, insightful", keywords: ["earth", "human", "alien"] },
  { id: "gym-motto", text: "Create a motto for a gym for sloths.", hints: "punny, short", keywords: ["sloth", "slow", "gym"] },
  { id: "coffee-ode", text: "Write an ode to coffee.", hints: "poetic, vivid", keywords: ["coffee", "bean", "brew", "cup"] },
  { id: "rename-tuesday", text: "Rename Tuesday and justify it.", hints: "creative, persuasive", keywords: ["tuesday", "week", "day"] },
  { id: "robot-rights", text: "Argue that robots deserve snack breaks.", hints: "debate style, funny", keywords: ["robot", "snack", "break"] },
  { id: "pirate-tech", text: "Explain the cloud like a pirate.", hints: "pirate voice, accurate", keywords: ["arr", "cloud", "ship", "treasure"] },
  { id: "fortune", text: "Write a fortune cookie that is oddly specific.", hints: "short, surprising", keywords: ["fortune", "cookie", "luck"] },
  { id: "villain", text: "Give a cartoon villain a terrible evil plan.", hints: "funny flaw, dramatic", keywords: ["villain", "plan", "evil", "mwahaha"] },
  { id: "first-date", text: "Plan the worst first date imaginable.", hints: "escalating comedy", keywords: ["date", "dinner", "awkward"] },
  { id: "plant-apology", text: "Apologize to a houseplant you forgot to water.", hints: "heartfelt, funny", keywords: ["plant", "water", "sorry", "leaf"] },
];
export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id) ?? CHALLENGES[0];

// ---------- Custom questions: host-written prompt, vetted server-side, used everywhere the auto challenge is ----------
export const QUESTION_MIN = 3, QUESTION_MAX = 200;
/** Trim, drop zero-width/invisible chars (so "Tr\u200bump" can't split a word), swap control chars for spaces, collapse whitespace. "" means "use the auto question". */
export const cleanQuestion = (raw: string) => raw.replace(/[\u00ad\u200b-\u200f\u2060-\u2064\u2066-\u2069\ufeff]/g, "").replace(/[\u0000-\u001f\u007f-\u009f\u2028-\u202e]/g, " ").replace(/\s+/g, " ").trim();
export const QUESTION_SUGGESTIONS = [
  "Convince a pigeon to pay rent.", "Write a eulogy for a dead phone battery.", "Pitch a theme park for introverts.",
  "Explain taxes to a golden retriever.", "Write a battle cry for a team of librarians.", "Describe a sandwich like a sports commentator.",
  "Give a TED talk on why naps should be mandatory.", "Write a Yelp review of the ocean.", "Invent a holiday and its weirdest tradition.",
  "Argue that socks are a scam.", "Write a horoscope for a houseplant.", "Pitch a reality show starring kitchen appliances.",
  "Apologize to the Moon for the noise.", "Explain the internet to a medieval knight.", "Write a motivational speech for a snail.",
];
const STOP = new Set("about after again also because been before being could does doing down each even ever every from have here into just like make more most much must only other over said same should since some still such than that their them then there these they this those through very want what when where which while will with would your yours write give explain argue pitch describe someone something".split(" "));
type QG = { challengeId: string; question?: string; questionState?: "pending" | "ok" | "rejected" | "error"; questionSource?: "rotation" };
export const customChallenge = (text: string): Challenge => {
  const kw = [...new Set(text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])].filter((w) => !STOP.has(w)).sort((a, b) => b.length - a.length).slice(0, 4);
  return { id: "custom", text, hints: "answers this exact question directly; funny, specific, original", keywords: kw };
};
/** The challenge a game is actually played on: the host's question once it passed the check, else the auto one. */
export const challengeOf = (g: QG) => (g.question && g.questionState === "ok" ? customChallenge(g.question) : challengeById(g.challengeId));
/** For setup, before the check finishes (pending counts as the host's question). */
export const challengeTentative = (g: QG) => (g.question && (g.questionState === "ok" || g.questionState === "pending") ? customChallenge(g.question) : challengeById(g.challengeId));
/** Keyed off the state only: a rejected question's text is wiped from the game, the note stays. */
export const questionNote = (g: QG) =>
  g.questionState === "rejected" ? "Your question didn't pass the check, so Jev picked one." : g.questionState === "error" ? "We couldn't check your question in time, so Jev picked one." : null;
/** True when the game is played on the host's own question (not an auto pick, not a rotation pick). */
export const isHostQuestion = (g: QG) => !!g.question && g.questionState === "ok" && g.questionSource !== "rotation";
/** Share of auto picks drawn from the player question rotation when it has entries. */
export const ROTATION_SHARE = 0.25;

export const POINTS: Record<Exclude<Mode, "exhibition">, { win: number; draw: number; loss: number }> = {
  duel: { win: 5, draw: 2, loss: 1 },
  hva: { win: 4, draw: 1, loss: 0 },
  solo: { win: 3, draw: 1, loss: 0 },
};
export const MIN_GAMES_TO_RANK = 3;
export const MIN_AGENT_GAMES_TO_RANK = 20;

export const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
