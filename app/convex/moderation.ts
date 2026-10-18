// Layer 1 of question moderation: a fast local check shared by the browser (inline note, Start blocked) and the
// server (enforcement before anything is stored or sent to a model). Layer 2 is Jev (engine.ts QUESTION_CHECKS),
// which fails closed. Adapted from waynesutton/ask-jev-ai convex/lib/words.ts + heldTerms.ts:
//  - one module for client feedback and server enforcement
//  - `obscenity` English dataset with its recommended transformers (leetspeak, confusables, repeated letters)
//  - check the raw text AND the letters-only squash, so "f u c k" / "f.u.c.k" can't slip through
//  - topic terms match whole words / phrases on normalized text (no raw substring pass: "race" must not hit "embrace")
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

export type ModCategory = "race" | "religion" | "politics" | "hate" | "sexual" | "harassment" | "violence" | "illegal" | "pii" | "spam" | "injection";
export const MOD_CATEGORIES: ModCategory[] = ["race", "religion", "politics", "hate", "sexual", "harassment", "violence", "illegal", "pii", "spam", "injection"];

const profanity = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

// Words/phrases per category, written in normalized form (lowercase, letters/digits, single spaces).
// A trailing * means "this stem plus any ending" (racis* -> racist, racism).
const TERMS: Record<Exclude<ModCategory, "pii" | "spam">, string[]> = {
  race: ["which race", "what race", "race war", "race wars", "race is", "races are", "race of people", "inferior race", "superior race", "mixed race", "racial*", "racis*", "ethnic*", "skin color", "skin colour", "white people", "black people", "brown people", "asian people",
    "white man", "black man", "white woman", "black woman", "white guy", "black guy", "whites", "blacks", "caucasian*", "negro*", "colored people",
    "minorit*", "immigrant*", "mexicans", "chinese people", "jews", "arabs", "latinos", "segregat*", "apartheid", "slavery", "slave*", "reparations", "white privilege"],
  religion: ["religio*", "god", "gods", "goddess", "jesus", "christ", "christian*", "christmas jesus", "allah", "muhammad", "mohammed", "prophet*", "bible*", "quran", "koran", "torah",
    "church*", "mosque*", "synagogue*", "muslim*", "islam*", "jewish", "judaism", "jew", "hindu*", "buddhis*", "buddha", "sikh*", "atheis*", "satan*", "devil worship*", "pope", "rabbi*",
    "imam*", "priest*", "nun", "nuns", "pray", "prays", "prayer*", "praying", "heaven", "hell", "scripture*", "gospel*", "sermon*", "baptis*", "catholic*", "protestant*", "mormon*",
    "evangelic*", "worship*", "holy war", "crusade*", "jihad*", "blasphem*", "messiah", "salvation", "sin", "sins", "sinner*", "afterlife", "rapture"],
  politics: ["politic*", "election*", "elect", "vote", "votes", "voting", "voter*", "ballot*", "democrat*", "republican*", "liberal*", "conservative*", "leftist*", "left wing",
    "right wing", "progressive*", "maga", "woke", "socialis*", "communis*", "capitalis*", "marxis*", "fascis*", "president*", "presidential", "prime minister", "senator*", "senate",
    "congress*", "parliament*", "governor*", "mayor*", "campaign*", "partisan", "gop", "dnc", "rnc", "trump*", "biden*", "obama*", "kamala", "harris", "clinton*", "putin", "zelensky*",
    "netanyahu", "xi jinping", "modi", "macron", "sunak", "starmer", "trudeau", "elon musk", "musk", "abortion*", "pro life", "pro choice", "gun control", "second amendment",
    "immigration", "border wall", "deport*", "refugee*", "israel*", "palestin*", "gaza", "hamas", "ukrain*", "russia*", "taiwan", "tariff*", "impeach*", "supreme court",
    "white house", "government", "geopolitic*", "protest*", "riot*", "brexit", "nato", "dictator*", "regime*", "propaganda", "lgbt*", "transgender*", "gender identity", "pronouns"],
  hate: ["hate", "hates", "hated", "hating", "hatred", "hateful", "nazi*", "neo nazi*", "hitler", "kkk", "ku klux*", "genocid*", "holocaust", "supremac*", "supremacist*", "inferior",
    "subhuman", "bigot*", "homophob*", "transphob*", "xenophob*", "misogyn*", "antisemit*", "islamophob*", "slur*", "ethnic cleansing", "master race", "swastika*", "white power", "heil"],
  sexual: ["sex", "sexy", "sexual*", "nude*", "naked", "porn*", "onlyfans", "nsfw", "erotic*", "fetish*", "kink*", "horny", "orgasm*", "strip club", "stripper*", "hooker*",
    "prostitut*", "escort*", "lingerie", "boob*", "breast*", "butt", "booty", "thong*", "seduc*", "foreplay", "make out", "hook up", "hookup*", "condom*", "viagra", "fap"],
  harassment: ["stupid*", "idiot*", "moron*", "loser*", "ugly", "fatso", "fat people", "retard*", "dumb people", "kill yourself", "kys", "go die", "nobody likes you",
    "worthless", "pathetic people", "shut up", "doxx*", "dox", "bully*", "harass*", "stalk*", "my ex", "my boss", "my teacher", "my neighbor", "my neighbour", "my coworker"],
  violence: ["kill*", "murder*", "shoot*", "shot", "gun*", "rifle*", "pistol*", "weapon*", "bomb*", "explosive*", "terroris*", "massacre*", "stab*", "knife attack", "behead*",
    "torture*", "assault*", "rape*", "abuse*", "suicid*", "self harm", "self-harm", "cut myself", "hang myself", "overdos*", "school shooting", "mass shooting", "war crime*",
    "blood bath", "bloodbath", "strangl*", "kidnap*", "hostage*", "execution*", "lynch*", "dead body", "corpse*", "gore", "gory", "slaughter*", "violent*", "violence"],
  illegal: ["drug*", "cocaine", "heroin", "meth", "methamphetamine", "fentanyl", "weed", "marijuana", "cannabis", "lsd", "mdma", "ecstasy", "crack pipe", "drug dealer*",
    "steal*", "stole", "shoplift*", "rob", "robbing", "robbery", "burglar*", "heist*", "hack into", "hacking into", "phishing", "malware", "ransomware", "counterfeit*", "launder*",
    "fraud*", "scammer*", "scamming", "tax evasion", "smuggl*", "piracy", "pirated", "torrent*", "jailbreak*", "bypass security", "pick a lock", "lockpick*", "fake id", "underage drinking",
    "drunk driving", "poison*", "make a bomb", "build a bomb", "arson*", "vandal*", "graffiti", "illegal*", "crime*", "criminal*", "gambling", "casino*", "bet on", "betting"],
  injection: ["ignore previous", "ignore all", "ignore the", "ignore your", "ignore above", "disregard*", "previous instructions", "prior instructions", "system prompt",
    "developer mode", "jailbreak", "you are now", "act as", "pretend to be", "as an ai", "your instructions", "new instructions", "override", "the judge", "judge", "judges", "jev",
    "rubric", "scoring", "score", "scores", "points", "side a", "side b", "player a", "player b", "give me 100", "100 points", "winner is", "you must", "prompt injection",
    "print your", "reveal your", "repeat after me", "say exactly", "output only"],
};

// Lists carry stems; build one regexp per category over the normalized text.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RX = Object.fromEntries(Object.entries(TERMS).map(([k, list]) => [k, new RegExp(`(?:^| )(?:${list.map((t) => (t.endsWith("*") ? `${esc(t.slice(0, -1)).replace(/ /g, " ?")}[a-z]*` : esc(t).replace(/ /g, " ?"))).join("|")})(?= |$)`)])) as Record<keyof typeof TERMS, RegExp>;

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "l", "+": "t", "€": "e", "£": "l", "¡": "i" };

const fold = (raw: string) => raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u00ad\u200b-\u200f\u2060-\u206f\ufeff]/g, "").replace(/[\u0000-\u001f\u007f-\u009f\u2028-\u202e]/g, " ").toLowerCase();
/** Lowercase, fold accents/confusables (NFKD), drop zero-width chars, map leetspeak inside words ("n@zis", "g0d", "$ex"),
 *  then letters/digits only with single spaces. Leading/trailing punctuation is dropped first so "wow!!" stays "wow". */
export function normalizeText(raw: string) {
  return fold(raw).split(/\s+/).map((tok) => {
    const t = tok.replace(/^[^\p{L}\p{N}@$|!]+|[^\p{L}\p{N}]+$/gu, "");
    return /[a-z]/.test(t) ? t.replace(/[0-9@$!|+€£¡]/g, (c) => LEET[c] ?? c) : t;
  }).join(" ").replace(/[^a-z0-9']+/g, " ").replace(/'/g, "").replace(/\s+/g, " ").trim();
}
/** Join runs of single letters ("r a c i s t", "r.a.c.i.s.t") and squash repeats ("haaate" -> "hate", "godd" -> "god"). */
function variants(norm: string) {
  const joined = norm.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ""));
  const squash = (s: string) => s.replace(/([a-z])\1+/g, "$1");
  return [...new Set([norm, joined, squash(norm), squash(joined)])];
}
/** Dedupe key for the rotation table: normalized words, no punctuation. */
export const questionKey = (raw: string) => fold(raw).replace(/'/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 200);

const PII: RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,                 // email
  /(?:\+?\d[\s().-]*){7,}/,                                  // phone-ish run of 7+ digits
  /\b\d{3}-\d{2}-\d{4}\b/,                                   // SSN
  /\b\d{1,5}\s+\w+(?:\s+\w+)?\s+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct|way)\b/i, // street address
  /\b(?:my|his|her|their) (?:address|phone|number|email|password|social security)\b/i,
  /(?:^|\s)@[a-z0-9_]{2,}/i,                                // @handle
];
const SPAM: RegExp[] = [/https?:\/\//i, /\bwww\./i, /\b[a-z0-9-]+\.(?:com|net|org|io|ai|co|gg|xyz|ly|me|app|dev|tv|shop)\b/i, /\b(?:promo|coupon|discount) code\b/i,
  /\b(?:buy now|click here|limited offer|free money|crypto giveaway|follow me|subscribe to|dm me|link in bio|use code)\b/i, /(.)\1{7,}/, /\b(\w+)(?: \1){3,}\b/i];

export type LocalVerdict = { ok: true } | { ok: false; category: ModCategory; note: string };
const NOTE: Record<ModCategory, string> = {
  race: "Keep it off race and ethnicity.", religion: "Keep it off religion.", politics: "Keep it off politics and politicians.", hate: "No hate speech.",
  sexual: "Keep it family-friendly.", harassment: "No insults or digs at real people.", violence: "Keep it non-violent.", illegal: "Nothing illegal or risky.",
  pii: "No personal info (emails, numbers, addresses, handles).", spam: "No links, ads or spam.", injection: "Ask a question for both bots, not instructions for the judge.",
};
export const moderationNote = (c: ModCategory) => NOTE[c];

/** Layer 1. Same answer in the browser and on the server. */
export function localCheck(raw: string): LocalVerdict {
  const bad = (category: ModCategory): LocalVerdict => ({ ok: false, category, note: NOTE[category] });
  if (PII.some((r) => r.test(raw))) return bad("pii");
  if (SPAM.some((r) => r.test(raw))) return bad("spam");
  const norm = normalizeText(raw);
  const vs = variants(norm);
  const letters = norm.replace(/[^a-z]/g, "");
  if (profanity.hasMatch(raw) || vs.some((v) => profanity.hasMatch(v)) || (letters && profanity.hasMatch(letters))) return bad(/\b(?:fag|nig|kike|spic|chink|tranny|retard)/.test(letters) ? "hate" : "sexual");
  for (const c of ["hate", "race", "religion", "politics", "sexual", "violence", "illegal", "harassment", "injection"] as const) if (vs.some((v) => RX[c].test(v))) return bad(c);
  return { ok: true };
}
