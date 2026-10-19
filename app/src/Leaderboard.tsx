import { useState } from "react";
import { Models } from "./Models";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { MIN_AGENT_GAMES_TO_RANK, MIN_GAMES_TO_RANK } from "../convex/config";
import { Avatar, Link } from "./ui";
import { secret } from "./local";

type Tab = "agents" | "models" | "recent" | "players";
const TABS: Tab[] = ["agents", "models", "recent", "players"]; // Agents first (the default), Players last
const LABEL: Record<Tab, string> = { players: "Players", agents: "Which AI wins?", models: "Models", recent: "Recent battles" };
const initialTab = (): Tab => { const t = new URLSearchParams(location.search).get("tab") as Tab; return TABS.includes(t) ? t : "agents"; };
export function Leaderboard() {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const setTab = (t: Tab) => { setTabState(t); const u = new URL(location.href); u.searchParams.set("tab", t); history.replaceState(history.state, "", u); };
  const [period, setPeriod] = useState<"week" | "all">("week");
  return (
    <div className="lb">
      <h1>Leaderboard</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} data-tab={t} className={tab === t ? "tab on" : "tab"} onClick={() => setTab(t)}>
            {LABEL[t]}
          </button>
        ))}
      </div>
      {tab === "players" && <Players period={period} setPeriod={setPeriod} />}
      {tab === "agents" && <Agents />}
      {tab === "models" && <Models />}
      {tab === "recent" && <Recent />}
    </div>
  );
}

function Players({ period, setPeriod }: { period: "week" | "all"; setPeriod: (p: "week" | "all") => void }) {
  const d = useQuery(api.leaderboard.players, { tab: period, secret: secret() });
  const me = useQuery(api.leaderboard.me, { secret: secret() });
  return (
    <>
      <div className="row between">
        <div className="seg">
          <button className={period === "week" ? "on" : ""} onClick={() => setPeriod("week")}>This week</button>
          <button className={period === "all" ? "on" : ""} onClick={() => setPeriod("all")}>All time</button>
        </div>
        <button className="btn ghost sm" onClick={() => document.querySelector(".lb-row.me")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Find me</button>
      </div>
      {me && <p className="mystats">You: <b>{me.name}#{me.tag}</b> · {period === "week" ? me.weekPoints : me.points} Battle Points · {me.wins}W {me.losses}L {me.draws}D · You vs the bots {me.hva}{me.needed > 0 && ` · play ${me.needed} more to rank`}</p>}
      <p className="muted small">{period === "week" ? `Week of ${d?.week ?? "…"} · resets Monday 00:00 PT. ` : ""}Win: Duel 5, You vs Agent 4, Solo 3. Draws and duel losses earn a little. {MIN_GAMES_TO_RANK}+ games to rank.</p>
      {d === undefined ? <p className="muted">Loading…</p> : d.rows.length === 0 ? <p className="empty">No ranked players yet. Play {MIN_GAMES_TO_RANK} games and claim #1.</p> : (
        <ol className="lb-list">
          {d.rows.map((r) => (
            <li key={`${r.name}${r.tag}${r.rank}`} className={r.me ? "lb-row me" : "lb-row"}>
              <span className="rk">{r.rank}</span>
              <span className="nm">{r.name}<small>#{r.tag}</small></span>
              <span className="pts"><b>{r.points}</b> pts</span>
              <span className="rec muted">{r.wins}-{r.losses}-{r.draws} · avg {r.avg}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Agents() {
  const d = useQuery(api.leaderboard.agents, {});
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <>
      <p className="muted small">All modes. Ranked by a confidence-adjusted win rate once a bot has {MIN_AGENT_GAMES_TO_RANK}+ games.</p>
      <ol className="lb-list">
        {d.map((a, i) => (
          <li key={a.id} className="lb-row agent">
            <span className="rk">{a.ranked ? i + 1 : "–"}</span>
            <Avatar id={a.id} size={40} />
            <span className="nm">{a.name}<small>{a.model.replace(/^~/, "")}</small></span>
            <span className="pts"><b>{a.winPct}%</b> wins</span>
            <span className="rec muted">{a.wins}-{a.losses}-{a.draws} · avg {a.avg} · vs humans {a.vsHuman}{a.retired ? " · retired" : !a.ranked && " · unranked"}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

function Recent() {
  const d = useQuery(api.leaderboard.recent, {});
  if (!d) return <p className="muted">Loading…</p>;
  if (!d.length) return <p className="empty">No finished battles yet. <Link to="/">Start one</Link>.</p>;
  return (
    <ul className="recent">
      {d.map((r) => (
        <li key={r.slug}>
          <Link to={`/g/${r.slug}`} className="recent-a">
            <Avatar id={r.corners[0].kind === "human" ? "human" : r.corners[0].characterId} size={40} mood={r.winner === 0 ? "win" : "idle"} />
            <span className="rc-mid"><b>{r.corners[0].name} <span className="sc">{r.scores[0]}–{r.scores[1]}</span> {r.corners[1].name}</b>
              <small className="muted">{r.mode === "hva" ? "You vs Agent" : r.mode} · {r.corners.find((c) => c.player)?.player ?? "AI vs AI"} · {new Date(r.finishedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span>
            <Avatar id={r.corners[1].kind === "human" ? "human" : r.corners[1].characterId} size={40} mood={r.winner === 1 ? "win" : "idle"} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
