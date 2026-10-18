import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Avatar, Link } from "./ui";
import { I } from "./icons";

type Board = FunctionReturnType<typeof api.models.board>;
type M = Board["models"][number];
const PROVIDER: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google", xai: "xAI", deepseek: "DeepSeek", moonshotai: "Moonshot", mistral: "Mistral", meta: "Meta", alibaba: "Alibaba", zai: "Z.ai", minimax: "MiniMax", typesafe: "TypeSafe", amazon: "Amazon", cohere: "Cohere", perplexity: "Perplexity", nousresearch: "Nous" };
export const providerName = (p: string) => PROVIDER[p] ?? p;
export const secs = (ms: number | null) => (ms == null ? "–" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
const usd = (x: number | null) => (x == null ? "–" : x < 0.0001 ? "<0.01¢" : x < 0.01 ? `${(x * 100).toFixed(2)}¢` : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}¢`);

/** Shared by the Models tab and the model sheet. 7-day window keeps the sheet light. */
export function useModelBoard(days: 7 | 30 = 30) { return useQuery(api.models.board, { days }); }

function Bar({ icon, label, value, pct, tone }: { icon: Parameters<typeof I>[0]["n"]; label: string; value: string; pct: number | null; tone?: "ok" | "acc" | "acc2" | "err" }) {
  return (
    <div className="mb-bar">
      <span className="mb-lbl"><I n={icon} size={14} /> {label}</span>
      <span className="mb-track" aria-hidden><span className={`mb-fill ${tone ?? "acc"}`} style={{ width: `${pct == null ? 0 : Math.max(3, Math.min(100, pct))}%` }} /></span>
      <b className="mb-val">{value}</b>
    </div>
  );
}

function Card({ m, rank, fastest, slowest }: { m: M; rank: number; fastest: number; slowest: number }) {
  // Speed bar: fastest model on the board fills the bar, the slowest gets a sliver.
  const speedPct = m.avgMs == null ? null : slowest === fastest ? 100 : 15 + (85 * (slowest - m.avgMs)) / (slowest - fastest);
  return (
    <li className={rank === 1 ? "mcard top" : "mcard"} data-model={m.model}>
      <div className="mc-head">
        <span className="mc-rank">{rank === 1 ? <I n="trophy" size={18} label="Top model" /> : `#${rank}`}</span>
        <span className="mc-bots">{m.bots.slice(0, 3).map((b) => <Avatar key={b.id} id={b.id} size={34} />)}</span>
        <span className="mc-name"><b>{m.label}</b><small>{providerName(m.provider)} · {m.bots.map((b) => b.name).join(", ")}{m.isDefault ? "" : " · swap-in"}</small></span>
      </div>
      <div className="mc-big"><b>{m.winPct ?? "–"}<small>%</small></b><span>win rate<br /><small className="muted">{m.wins}-{m.losses}-{m.draws} in {m.games} game{m.games === 1 ? "" : "s"}</small></span></div>
      <Bar icon="target" label="Jev score" value={m.avgScore == null ? "–" : `${m.avgScore}`} pct={m.avgScore} tone="acc2" />
      <Bar icon="clock" label="Response" value={secs(m.avgMs)} pct={speedPct} tone="ok" />
      <Bar icon="check" label="Reliability" value={m.errorRate == null ? "–" : `${Math.round(100 - m.errorRate)}%`} pct={m.errorRate == null ? null : 100 - m.errorRate} tone={m.errorRate != null && m.errorRate > 5 ? "err" : "acc"} />
      <div className="mc-foot muted small">
        {m.ttftMs != null && <span><I n="zap" size={13} /> first word {secs(m.ttftMs)}</span>}
        <span><I n="coin" size={13} /> {usd(m.costPerGame)} / game</span>
        <span><I n="cpu" size={13} /> {m.calls} call{m.calls === 1 ? "" : "s"}</span>
      </div>
    </li>
  );
}

export function Models() {
  const [days, setDays] = useState<7 | 30>(30);
  const d = useModelBoard(days);
  const seg = (
    <div className="seg">
      <button className={days === 7 ? "on" : ""} onClick={() => setDays(7)}>7 days</button>
      <button className={days === 30 ? "on" : ""} onClick={() => setDays(30)}>30 days</button>
    </div>
  );
  if (d === undefined) return <>{seg}<p className="muted">Loading…</p></>;
  const live = d.models.filter((m) => m.games > 0);
  const waiting = d.models.filter((m) => m.games === 0);
  const ms = live.map((m) => m.avgMs).filter((x): x is number => x != null);
  const fastest = Math.min(...ms), slowest = Math.max(...ms);
  return (
    <div className="mboard">
      <div className="row between">{seg}<span className="muted small"><I n="chart" size={14} /> {d.totals.games} bot results · {d.totals.calls} model calls</span></div>
      <p className="muted small">Every bot answer, Jev score and verdict through the Convex AI Gateway is timed and counted. Win rate counts draws as half; ranking evens out small samples. Response is the average time to a full answer. Updates every minute.</p>
      {live.length === 0 ? (
        <div className="empty mb-empty">
          <I n="chart" size={36} />
          <p><b>The model board fills up as bots battle.</b><br />No games scored in the last {days} days yet. Each finished battle adds a card here.</p>
          <Link to="/" className="btn">Start a battle</Link>
        </div>
      ) : (
        <ol className="mcards">{live.map((m, i) => <Card key={m.model} m={m} rank={i + 1} fastest={fastest} slowest={slowest} />)}</ol>
      )}
      <section className="mcrew">
        <h3><I n="gavel" size={16} /> Behind the scenes</h3>
        <ul>
          {d.crew.map((c) => (
            <li key={c.role}>
              <span className="nm">{c.what}<small>{c.label}</small></span>
              <span className="muted small">{c.calls ? <>{c.calls} calls · {secs(c.avgMs)} avg · {c.errorRate === 0 ? "no errors" : `${c.errorRate}% errors`}</> : "No calls yet"}</span>
            </li>
          ))}
        </ul>
      </section>
      {waiting.length > 0 && <p className="muted small mb-wait">Waiting for their first game: {waiting.map((m) => m.label).join(", ")}.</p>}
    </div>
  );
}
