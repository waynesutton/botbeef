// E2E: light self-learning (no model training). Signals per auto question (completion, rematch, closeness, abandonment)
// and per matchup (closeness) are recorded in Convex; picks lean toward what plays well but keep exploring.
import { randomBytes } from "node:crypto";
import { ConvexHttpClient } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/browser/index.js";
import { anyApi as api } from "/workspace/agent-battle/app/node_modules/convex/dist/esm/server/index.js";
import { admin } from "./admin.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const cx = new ConvexHttpClient(S.replace(".convex.site", ".convex.cloud"));
const results = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const sx = () => randomBytes(32).toString("base64url");
const view = (slug) => cx.query(api.games.view, { slug });
const until = async (slug, pred, ms = 120000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await view(slug); if (pred(v)) return v; await new Promise((r) => setTimeout(r, 1000)); } return v; };
const Z = { games: 0, completed: 0, abandoned: 0, rematches: 0, closeSum: 0 };
const stat = (key, pair) => admin("learn:inspect", { ...(key ? { key } : {}), ...(pair ? { pair } : {}) });

// ---------- weighting + exploration (pure, over fake stats) ----------
{ const strong = { games: 20, completed: 20, abandoned: 0, rematches: 8, closeSum: 17 };
  const weak = { games: 20, completed: 6, abandoned: 14, rematches: 0, closeSum: 4 };
  const r = admin("learn:simulate", { stats: [strong, Z, weak], n: 4000 });
  const sh = r.counts.map((c) => c / 4000);
  ok("better-performing question is picked most", sh[0] > sh[1] && sh[1] > sh[2], JSON.stringify(sh.map((x) => x.toFixed(3))));
  ok("a brand-new question sits near the middle (priors)", r.quality[1] > r.quality[2] && r.quality[1] < r.quality[0], JSON.stringify(r.quality));
  ok("exploration: the weakest still gets picked (>= ~5%)", sh[2] >= 0.05, sh[2].toFixed(3));
  ok("nudge, not lock-in: the best stays under 70%", sh[0] < 0.7, sh[0].toFixed(3)); }

// ---------- live: completion + closeness for the question and the matchup ----------
const secret = sx();
const g = await cx.mutation(api.games.start, { secret, name: "Learn Lu", mode: "exhibition", characterId: "deepy", opponentId: "townsy", roundMs: 15000 });
const k = admin("learn:keyOf", { slug: g.slug });
ok("auto question has a stats key; matchup pair is sorted", !!k.key && k.pair === "deepy|townsy", JSON.stringify(k));
const b0 = stat(k.key, k.pair);
const v = await until(g.slug, (x) => ["finished", "no_contest"].includes(x.status));
const b1 = stat(k.key, k.pair);
const q0 = b0.q ?? Z, q1 = b1.q ?? Z, m0 = b0.m ?? { games: 0, closeSum: 0 }, m1 = b1.m ?? { games: 0, closeSum: 0 };
const close = 1 - Math.abs(v.corners[0].score - v.corners[1].score) / 100;
ok("finished game: question games+1, completed+1", v.status === "finished" && q1.games === q0.games + 1 && q1.completed === q0.completed + 1, `${v.status} ${JSON.stringify(q1)}`);
ok("finished game: score closeness recorded (0..1, matches finals)", Math.abs(q1.closeSum - q0.closeSum - close) < 0.03, (q1.closeSum - q0.closeSum).toFixed(3) + " vs " + close.toFixed(3));
ok("matchup closeness recorded", m1.games === m0.games + 1 && m1.closeSum > m0.closeSum - 1e-9, JSON.stringify(m1));
const rq = admin("learn:rivalQuality", { me: "deepy", options: ["townsy", "grokbot"] });
ok("rival weighting reads matchup closeness (0..1)", [rq.townsy, rq.grokbot].every((x) => x >= 0 && x <= 1), JSON.stringify(rq));

// ---------- rematch + abandonment ----------
const r = await cx.mutation(api.games.rematch, { secret, slug: g.slug });
const q2 = stat(k.key).q;
ok("rematch counts toward the original question", q2.rematches === q1.rematches + 1, JSON.stringify(q2));
const rk = admin("learn:keyOf", { slug: r.slug });
await until(r.slug, (x) => x.status === "live", 60000);
const a0 = stat(rk.key).q ?? Z;
await cx.mutation(api.games.endGame, { slug: r.slug, seat: r.seat });
const a1 = stat(rk.key).q;
ok("ending a live game counts as abandonment for its question", a1.abandoned === a0.abandoned + 1 && a1.games === a0.games + 1 && a1.completed === a0.completed, JSON.stringify(a1));

// ---------- host-typed questions aren't tracked; the rotation stays moderated ----------
const h = await cx.mutation(api.games.start, { secret: sx(), name: "Learn Lu", mode: "duel", characterId: "grokbot", roundMs: 15000, question: `Pitch a ${randomBytes(2).toString("hex").replace(/\d/g, "x")} umbrella to a duck` });
ok("host-typed question has no stats key", admin("learn:keyOf", { slug: h.slug }).key === null);
await cx.mutation(api.games.endGame, { slug: h.slug, seat: h.seat });
const live = admin("rotation:listQuestions", {}).map((x) => x.text);
let fine = true; for (let i = 0; i < 6; i++) { const t = admin("rotation:previewPick", {}); if (t && !live.includes(t)) fine = false; }
ok("weighted rotation picks only moderated, live questions", fine);

await new Promise((r) => setTimeout(r, 0));
const f = results.filter((r) => !r.pass);
console.log(`\n${results.length - f.length}/${results.length} passed`);
process.exit(f.length ? 1 : 0);
