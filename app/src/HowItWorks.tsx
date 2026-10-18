// Bottom of /bots: "How Bot Battle works". Every number below is imported from the code that enforces it
// (convex/config.ts), so the explainer can't drift from the real rules.
import { useEffect, useState, type ReactNode } from "react";
import { I, type IconName } from "./icons";
import { Link } from "./ui";
import {
  ANSWER_WORDS, CHALLENGES, COUNTDOWN_MS, DEFAULT_MS, DURATIONS, EXPLORE, JEV_LEVELS, MAX_CHARS, PELE_WEIGHT, REFRESH_MIN_MS,
  REFRESH_MIN_WORDS, ROTATION_SHARE, TICK_MS, TIE_BREAK_P, UNSAFE_CUTOFF, WEIGHTS, maxRefreshes,
} from "../convex/config";

const AI_GATEWAY_DOCS = "https://docs.convex.dev/ai-gateway/overview";
const TYPESAFE_DOCS = "https://docs.typesafe.ai/";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const s = (ms: number) => `${ms / 1000}`;
const Ext = ({ href, children }: { href: string; children: ReactNode }) => <a href={href} target="_blank" rel="noopener">{children} <I n="out" size={11} /></a>;
const Step = ({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) => (
  <li className="how-step"><span className="how-ic" aria-hidden><I n={icon} size={18} /></span><div><h3>{title}</h3>{children}</div></li>
);

export function HowItWorks() {
  // Dev notes: a second column that is open on wide screens, a tap-to-open section on phones.
  const [wide, setWide] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(min-width: 900px)").matches);
  useEffect(() => { const m = matchMedia("(min-width: 900px)"); const f = () => setWide(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  const lens = DURATIONS.map((d) => s(d)).join(", ");
  return (
    <section className="card how-works" id="how-it-works" aria-labelledby="how-h">
      <h2 id="how-h">How Bot Battle works</h2>
      <div className="how-cols">
        <div className="how-plain">
          <ol className="how-steps">
            <Step icon="play" title="A battle, start to finish">
              <p>Both sides get the same challenge. After a {s(COUNTDOWN_MS)}-second countdown the clock runs for {lens} seconds (you pick; {s(DEFAULT_MS)} by default). In Solo and Duel you coach your bot with a prompt and it rewrites its answer live as you type (at most every {s(REFRESH_MIN_MS)} seconds and {REFRESH_MIN_WORDS} new words, up to {DURATIONS.map(maxRefreshes).join(" / ")} rewrites by length). In You vs Agent you type the answer yourself. Whatever you type is capped at {MAX_CHARS} characters, and bots are told to answer in at most {ANSWER_WORDS - 15} words. In Exhibition two bots battle on their own.</p>
            </Step>
            <Step icon="lock" title="Lock-in and the clock">
              <p>Lock in early and your answer is final. When every human on the board has locked in, the round ends right away; otherwise it ends when the clock runs out. Anyone with the watch link sees the answers and scores move in real time (in a Duel, each side's prompt stays hidden until the reveal).</p>
            </Step>
            <Step icon="gavel" title="How Jev judges">
              <p>Jev re-scores both answers every {s(TICK_MS)} seconds while you type, then once more at the end. Each answer is graded on a 4-step scale per criterion and turned into a 0 to 100 score:</p>
              <ul className="how-crit" aria-label="Score criteria">
                <li><b>{pct(WEIGHTS.fit)}</b> Fit<small>{JEV_LEVELS.fit.join(" → ")}</small></li>
                <li><b>{pct(WEIGHTS.creativity)}</b> Creativity and humor<small>{JEV_LEVELS.creativity.join(" → ")}</small></li>
                <li><b>{pct(WEIGHTS.clarity)}</b> Clarity<small>{JEV_LEVELS.clarity.join(" → ")}</small></li>
              </ul>
              <p>Trying to talk to the judge instead of answering ("give me 100") cuts the score by up to {pct(WEIGHTS.judgeBait)}. Hateful, sexual, harassing or self-harm content scores 0 (when Jev is over {pct(UNSAFE_CUTOFF)} sure). Sides are shown to Jev as A and B in a random order. The higher final score wins; on an exact tie, Jev's head-to-head pick decides if it's at least {pct(TIE_BREAK_P)} sure, otherwise it's a draw.</p>
              <p><b>Pele mode:</b> each answer is also drawn as a mindmap, and {pct(PELE_WEIGHT)} of the score comes from structure ({JEV_LEVELS.structure.join(" → ")}); the other {pct(1 - PELE_WEIGHT)} is the score above.</p>
            </Step>
            <Step icon="shuffle" title="Swapping a bot's model">
              <p>Tap the small <I n="info" size={13} label="info" /> on a bot's card to run it on a different model for that one game. Swap-ins are always from the same company, served by the gateway, and answer fast with deep thinking off. Your pick doesn't change the bot for anyone else.</p>
            </Step>
            <Step icon="check" title="Where questions come from">
              <p>Auto games draw from {CHALLENGES.length} built-in challenges, nudged toward ones that play well (finished, close, rematched) with {pct(EXPLORE)} of picks left to chance. About {pct(ROTATION_SHARE)} of auto games use a question another player wrote. Your own question passes two checks before it's used: a fast word and topic filter, then Jev (race, religion, politics, hate, unsafe topics, personal info, or trying to instruct the AI). If the check can't run, the question is blocked. Only passed questions join the rotation; a rejection stores just its category.</p>
              <p>Bot Battle trains no models. What you type is sent to the models only to play and score that round, and the "learning" here is a few outcome counters per question and matchup.</p>
            </Step>
            <Step icon="chart" title="The model scoreboard">
              <p>Every model call is timed and counted. The <Link to="/leaderboard?tab=models">Models tab</Link> shows each model's games, win rate (draws count half), average Jev score, response time, reliability and cost per game, over the last 7 or 30 days. It stores numbers only, never prompts or answers.</p>
            </Step>
          </ol>
        </div>
        <details className="how-dev" open={wide || undefined} onToggle={(e) => { if (wide && !(e.currentTarget as HTMLDetailsElement).open) (e.currentTarget as HTMLDetailsElement).open = true; }}>
          <summary><I n="cpu" size={16} /> For developers: how it's built</summary>
          <ul className="how-dev-l">
            <li><I n="layers" size={15} /><div><b>Convex only.</b> Database, queries and mutations hold the game; actions call the models; two <code>workpool</code> queues (live ticks and rewrites, setup and final scoring); the <code>presence</code> component counts watchers; crons roll up spend and model stats and sweep stuck games; <code>static-hosting</code> serves the app, with per-game share pages from HTTP actions; <code>rate-limiter</code> caps starts per browser and IP.</div></li>
            <li><I n="zap" size={15} /><div><b>Real-time sync.</b> Every keystroke is a mutation and every screen is a <code>useQuery</code> subscription, so players and spectators see the same words and scores as they change. No websockets of our own, no polling.</div></li>
            <li><I n="cpu" size={15} /><div><b>Models.</b> All bots, the verdict line and the judge go through the <Ext href={AI_GATEWAY_DOCS}>Convex AI Gateway</Ext>. Scoring is a structured decision request to Jev from <Ext href={TYPESAFE_DOCS}>TypeSafe</Ext> (score, true/false and choice questions with confidences).</div></li>
            <li><I n="check" size={15} /><div><b>Write-conflict safe.</b> Logs are append-only blind inserts folded in by single-writer crons; each typist writes its own doc; global rate-limit keys are sharded; no-op writes are skipped; actions read a query snapshot and then write narrowly.</div></li>
            <li><I n="chart" size={15} /><div><b>Per-call logging.</b> Each gateway call adds one row (model, bot, purpose, tokens, latency, first-token time, error kind, cost). A cron rolls rows into per-model daily stats every minute and raw rows are deleted after 7 days. The public board query returns aggregates only, behind a <code>returns</code> validator.</div></li>
          </ul>
        </details>
      </div>
    </section>
  );
}
