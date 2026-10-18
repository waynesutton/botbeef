import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { I } from "./icons";
import { useMutation, useQuery } from "convex/react";
import usePresence from "@convex-dev/presence/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import { charById, MAX_CHARS, secsLabel, words } from "../convex/config";
import { Avatar, Link, Meter, Sparkline, copy, nameFor, colorFor, useNow, useSpring, xIntent, type Mood } from "./ui";
import { go, isEmbed } from "./nav";
import { errMsg, secret, store } from "./local";
import { PeleMap } from "./PeleMap";
import { buzz } from "./haptics";
import { buildMap, mapNodes } from "../convex/mindmap";

type View = NonNullable<FunctionReturnType<typeof api.games.view>>;
type CornerV = View["corners"][number];

const at = <T extends { t: number }>(xs: T[], t: number) => { let r: T | undefined; for (const x of xs) if (x.t <= t) r = x; return r; };

export function Game(p: { slug: string; asPlayer: boolean }) {
  // One presence session per page, mounted above every status/layout branch, so stage <-> board <-> results
  // switches never disconnect + rejoin (each rejoin is a new session and a presence worker kick).
  return <WatchProvider slug={p.slug}><GameInner {...p} /></WatchProvider>;
}
function GameInner({ slug, asPlayer }: { slug: string; asPlayer: boolean }) {
  const seat = asPlayer ? store.seat(slug) : undefined;
  const v = useQuery(api.games.view, { slug, seat });
  const embed = isEmbed();
  const running = !!v && ["setup", "countdown", "live", "closing"].includes(v.status);
  const now = useNow(100, running);
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const replayNow = useNow(50, replayAt !== null);
  useGameHaptics(v ?? null, now);

  if (v === undefined) return <div className="center muted pad">Loading the battle…</div>;
  if (v === null) return <div className="card center-card"><h2>No battle here.</h2><p className="muted">This game doesn't exist.</p><Link to="/" className="btn">Start your own</Link></div>;

  const done = v.status === "finished";
  const me = v.me;
  const piloting = me >= 0 && v.corners[me].pilot === "human";
  const live = v.status === "live" && v.endsAt !== null && now < v.endsAt;
  const counting = v.status === "countdown" || (v.status === "live" && v.startsAt !== null && now < v.startsAt);

  // Replay: walk the stored score + answer history back through time.
  let corners = v.corners;
  const t0 = v.startsAt ?? 0, t1 = v.endsAt ?? 0;
  const rt = replayAt !== null ? t0 + (replayNow - replayAt) * 5 : null;
  if (rt !== null && rt > t1 + 4000) setTimeout(() => setReplayAt(null), 0);
  if (rt !== null) corners = v.corners.map((c) => ({ ...c, score: at(c.history, rt)?.s ?? 0, answer: c.answerHistory.length ? at(c.answerHistory, rt)?.text ?? "" : c.answer, final: false }));

  const remaining = live ? Math.max(0, (v.endsAt ?? 0) - now) : counting ? v.roundMs : 0;
  // While a player is typing, the whole battle lives in one viewport-fitted stage (keyboard-safe on phones).
  if (piloting && seat && (live || counting) && !embed) return (
    <Stage v={v} slug={slug} remaining={remaining} live={live}>
      {counting && v.startsAt && <Countdown n={Math.max(1, Math.ceil((v.startsAt - now) / 1000))} />}
      <Composer key={slug} slug={slug} seat={seat} corner={v.corners[me]} hva={v.mode === "hva"} enabled={live} />
    </Stage>
  );
  return (
    <div className={embed ? "game embedded" : "game"}>
      {/* In-game the count lives only in the bottom share row (next to Copy watch link / Play on X); embeds and finished games keep the one pill. */}
      {(done || embed) && <Watching slug={slug} />}
      <div className="chal">
        <span className="chal-k">{v.mode === "hva" ? "You vs Agent" : v.mode === "duel" ? "Duel" : v.mode === "exhibition" ? "Exhibition" : "Solo"} · <span className="len">{secsLabel(v.roundMs)} battle</span> {v.pele && <> · <span className="pele-k">Pele mode</span></>} · {v.challenge.custom ? "Custom question" : "Challenge"}</span>
        <p className="chal-t">{v.questionCheck ?? v.challenge.text}</p>
        {v.questionCheck && <p className="chal-n">Checking your question…</p>}
        {v.questionNote && <p className="chal-n" role="status">{v.questionNote}</p>}
        {(live || counting) && <Timer ms={remaining} total={v.roundMs} />}
      </div>
      <Arena v={v} corners={corners} running={live || rt !== null} replay={rt !== null} />
      {counting && v.startsAt && <Countdown n={Math.max(1, Math.ceil((v.startsAt - now) / 1000))} />}
      {v.status === "setup" && <p className="status">Picking a rival…</p>}
      {v.status === "lobby" && <Lobby v={v} slug={slug} seat={seat} />}
      {v.status === "closing" && <p className="status pulse">Time! Jev is scoring the final answers…</p>}
      {piloting && seat && (live || counting) && <Composer key={slug} slug={slug} seat={seat} corner={v.corners[me]} hva={v.mode === "hva"} enabled={live} />}
      {done && <Reveal v={v} slug={slug} seat={seat} onReplay={() => setReplayAt(Date.now())} replaying={rt !== null} />}
      {(v.status === "no_contest" || v.status === "ended" || v.status === "abandoned") && (
        <div className="card center-card"><h3>{v.status === "no_contest" ? "No contest." : v.status === "ended" ? "The host ended this battle." : "This battle was abandoned."}</h3>{v.verdict && <p>{v.verdict}</p>}<Link to="/" className="btn">Start your own</Link></div>
      )}
      {!done && <ShareBar v={v} slug={slug} />}
    </div>
  );
}

/** Haptics on transitions seen in this tab only (opening a finished game doesn't buzz): countdown "go", then win/lose for players. */
function useGameHaptics(v: View | null, now: number) {
  const status = v?.status ?? "", me = v?.me ?? -1, winner = v?.winner ?? null;
  const live = !!v && v.status === "live" && v.endsAt !== null && now < v.endsAt && (v.startsAt === null || now >= v.startsAt);
  const counting = !!v && (v.status === "countdown" || (v.status === "live" && v.startsAt !== null && now < v.startsAt));
  const seen = useRef({ counting: false, running: false });
  useEffect(() => {
    if (counting) seen.current.counting = true;
    if (live) { if (seen.current.counting) buzz("go"); seen.current.counting = false; seen.current.running = true; }
  }, [live, counting]);
  useEffect(() => {
    if (status !== "finished" || !seen.current.running || me < 0) return;
    seen.current.running = false;
    buzz(winner === me ? "win" : "lose");
  }, [status, me, winner]);
  useEffect(() => { if (["closing", "live"].includes(status)) seen.current.running = true; }, [status]);
}

function Timer({ ms, total }: { ms: number; total: number }) {
  const f = ms / total, R = 22, C = 2 * Math.PI * R;
  return (
    <div className={ms < 10_000 ? "timer hot" : "timer"} aria-label={`${Math.ceil(ms / 1000)} seconds left`}>
      <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r={R} className="tr-bg" /><circle cx="26" cy="26" r={R} className="tr-fg" strokeDasharray={C} strokeDashoffset={C * (1 - f)} /></svg>
      <b>{Math.ceil(ms / 1000)}</b>
    </div>
  );
}
function Countdown({ n }: { n: number }) {
  return <div className="countdown" aria-live="assertive"><span key={n}>{n}</span></div>;
}

function useReactions(corners: CornerV[], keywords: string[]) {
  const counts = corners.map((c) => (c.kind === "human" ? c.draftWords : c.answerWords + (c.pilot === "human" ? c.draftWords : 0)));
  const prev = useRef(counts);
  const [bump, setBump] = useState([0, 0]);
  const [glance, setGlance] = useState([0, 0]);
  const [ooh, setOoh] = useState<[number, number]>([0, 0]);
  const [typingAt, setTypingAt] = useState([0, 0]);
  const key = counts.join(",");
  useEffect(() => {
    counts.forEach((n, i) => {
      if (n > prev.current[i]) {
        setBump((b) => b.map((x, j) => (j === i ? x + 1 : x)));
        setGlance((g) => g.map((x, j) => (j === 1 - i ? x + 1 : x)));
        setTypingAt((t) => t.map((x, j) => (j === i ? Date.now() : x)));
        const txt = (corners[i].kind === "human" ? corners[i].draft : corners[i].answer) ?? "";
        const last = txt.trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z-]/g, "") ?? "";
        if (last && keywords.some((k) => last.startsWith(k.toLowerCase()))) setOoh((o) => (i === 0 ? [o[0] + 1, o[1]] : [o[0], o[1] + 1]));
      }
    });
    prev.current = counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { bump, glance, ooh, typingAt };
}

function useMoods(corners: CornerV[], running: boolean, winner: View["winner"], done: boolean, typingAt: number[]) {
  const s = corners.map((c) => c.score);
  const prev = useRef(s);
  const [excitedAt, setExcitedAt] = useState([0, 0]);
  useEffect(() => {
    s.forEach((x, i) => { if (x - prev.current[i] >= 8) setExcitedAt((e) => e.map((y, j) => (j === i ? Date.now() : y))); });
    prev.current = s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.join(",")]);
  const now = useNow(500, running);
  return [0, 1].map((i): Mood => {
    if (done && winner !== null) return winner === "draw" ? "focused" : winner === i ? "win" : "lose";
    if (!running) return "idle";
    if (now - typingAt[i] < 1200) return "typing"; // typing reads first, so the bot visibly types while words land
    if (now - excitedAt[i] < 1800) return "excited";
    if (s[i] - s[1 - i] >= 15) return "smug";
    if (s[1 - i] - s[i] >= 15) return "worried";
    return "focused";
  });
}

/** Typing, keyword hits and live Jev score swings -> simple 2D motion for each corner (no emoji or text pops). */
function useCues(corners: CornerV[], running: boolean, winner: View["winner"], done: boolean, keywords: string[]) {
  const { bump, glance, ooh, typingAt } = useReactions(corners, keywords);
  const moods = useMoods(corners, running, winner, done, typingAt);
  const hits = useSwings(corners);
  return { bump, glance, hop: ooh, moods, hits };
}

function Arena({ v, corners, running, replay }: { v: View; corners: CornerV[]; running: boolean; replay: boolean }) {
  const done = v.status === "finished" && !replay;
  const { bump, glance, hop, moods, hits } = useCues(corners, running, v.winner, done, v.challenge.keywords);
  return (
    <div className="arena">
      {corners.map((c, i) => (
        <Fighter key={i} c={c} i={i} you={v.me === i} mood={moods[i]} bump={bump[i]} glance={glance[i]} hit={hits[i]} hop={hop[i]} mode={v.mode} showPrompt={done || v.mode !== "duel" || v.me === i} pele={v.pele ? { question: v.challenge.text, live: !done } : null} />
      ))}
      <div className="vs" aria-hidden>VS</div>
    </div>
  );
}

type PeleCtx = { question: string; live: boolean } | null;
const mapText = (c: CornerV) => (c.kind === "human" ? c.draft : c.answer);
function Fighter({ c, i, you, mood, bump, glance, hit, hop, mode, showPrompt, pele }: { c: CornerV; i: number; you: boolean; mood: Mood; bump: number; glance: number; hit: Hit; hop: number; mode: string; showPrompt: boolean; pele: PeleCtx }) {
  const ch = c.kind === "agent" ? charById(c.characterId ?? undefined) : undefined;
  const color = colorFor(c);
  const label = c.kind === "human" ? `${c.name ?? "Human"}${c.tag ? `#${c.tag}` : ""}` : nameFor(c);
  const pilot = c.kind === "agent" && c.pilot === "human" ? `${c.name ?? "Pilot"}${c.tag ? `#${c.tag}` : ""}` : c.kind === "agent" ? "Autopilot" : null;
  const text = c.kind === "human" ? c.draft : c.answer;
  const hidden = text === null;
  const id = c.kind === "human" ? "human" : c.characterId;
  return (
    <section className={`fighter f${i}`} style={{ ["--c" as string]: color }} aria-label={label}>
      <div className="f-head">
        <HitWrap hit={hit} side={i} still={c.kind === "agent"}><Avatar id={id} size={88} mood={mood} bump={bump} glance={glance} hop={hop} flip={i === 1} full anim hit={hit} expand={nameFor(c)} extra={pele && text !== null ? <PeleMap question={pele.question} text={text} size="full" live={pele.live} label={`${nameFor(c)}'s mindmap`} /> : undefined} /></HitWrap>
        <div className="f-id">
          <b>{label}{you && <span className="you">you</span>}</b>
          <small>{ch ? <>powered by <span className={c.modelSwapped ? "pw swapped" : "pw"} data-model={c.model ?? ch.model}>{(c.model ?? ch.model).replace(/^~/, "")}</span></> : "typing live"}{pilot && ` · ${pilot}`}</small>
        </div>
      </div>
      <Meter score={c.score} color={color} align={i === 0 ? "left" : "right"} final={c.final} />
      <div className={`bubble${c.streaming ? " streaming" : ""}`}>
        {!c.filled ? <span className="muted">Waiting for challenger…</span>
          : hidden ? <span className="muted"><I n="pencil" /> {c.draftWords} words · hidden until the reveal</span>
          : text ? text : <span className="muted">{c.kind === "agent" ? (c.pilot === "human" ? "Waiting for the coach's first words…" : "Warming up…") : "…"}</span>}
      </div>
      {pele && c.filled && (hidden
        ? <p className="pm-hidden muted">Mindmap hidden until the reveal</p>
        : <PeleMap question={pele.question} text={text ?? ""} live={pele.live} label={`${nameFor(c)}'s mindmap`} zoom={pele.live ? undefined : `${nameFor(c)}'s mindmap`} />)}
      {c.kind === "agent" && c.pilot === "human" && showPrompt && !you && c.draft && (
        <p className="prompt"><span>Coach:</span> {c.draft}</p>
      )}
      {mode === "duel" && !showPrompt && c.pilot === "human" && <p className="prompt muted">Coach is typing · {c.draftWords} words</p>}
    </section>
  );
}

function Composer({ slug, seat, corner, hva, enabled }: { slug: string; seat: string; corner: CornerV; hva: boolean; enabled: boolean }) {
  const type = useMutation(api.games.type);
  const lockIn = useMutation(api.games.lockIn);
  const [text, setText] = useState("");
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (enabled) ref.current?.focus(); }, [enabled]);
  // Single-flight: at most one draft write in the air; bursts collapse to the latest text, and unchanged text is never re-sent.
  const flight = useRef<{ busy: boolean; next: string | null; last: string }>({ busy: false, next: null, last: "" });
  const flush = () => {
    const f = flight.current;
    if (f.busy || f.next === null) return;
    const t = f.next; f.next = null;
    if (t === f.last) return;
    f.busy = true; f.last = t;
    void type({ slug, seat, seq: ++seq.current, text: t }).catch(() => { f.last = ""; }).finally(() => { f.busy = false; flush(); });
  };
  const send = (t: string) => { clearTimeout(timer.current); flight.current.next = t; flush(); };
  // Lock in: the final text must land before lockIn (the client runs mutations in call order), so skip the queue.
  const sendNow = (t: string) => { clearTimeout(timer.current); flight.current.next = null; flight.current.last = t; void type({ slug, seat, seq: ++seq.current, text: t }).catch(() => {}); };
  const onChange = (t: string) => {
    const s = t.slice(0, MAX_CHARS);
    setText(s);
    if (/[\s.,!?;:]$/.test(s)) send(s);
    else { clearTimeout(timer.current); timer.current = setTimeout(() => send(s), 250); }
  };
  const locked = corner.locked;
  return (
    <div className="composer">
      <label className="lbl" htmlFor="draft">{hva ? "Your answer. Beat the bot with your own words." : `Coach ${nameFor(corner)}: tell it how to win`}</label>
      <textarea id="draft" ref={ref} className="inp ta" value={text} disabled={!enabled || locked} maxLength={MAX_CHARS} rows={2} enterKeyHint="done"
        placeholder={enabled ? (hva ? "Type your answer…" : "e.g. be dramatic, use a pun, end with a mic drop") : "Get ready…"} onChange={(e) => onChange(e.target.value)} />
      <div className="row between">
        <small className="muted">{words(text)} words · {MAX_CHARS - text.length} left</small>
        <button className="btn" disabled={!enabled || locked || !text.trim()} onClick={() => { sendNow(text); void lockIn({ slug, seat }); }}>{locked ? <><I n="lock" /> Locked</> : "Lock in"}</button>
      </div>
    </div>
  );
}

function Lobby({ v, slug, seat }: { v: View; slug: string; seat?: string }) {
  const regen = useMutation(api.games.regenerateInvite);
  const [inv, setInv] = useState(store.invite(slug));
  const [msg, setMsg] = useState("");
  if (!v.isHost) return <p className="status">Waiting for the challenger to accept…</p>;
  const url = inv ? `${location.origin}/j/${inv}` : null;
  return (
    <div className="card lobby">
      <h3>Send your invite</h3>
      <p className="muted">One person can claim this seat. The link works once and expires in 30 minutes.</p>
      {url && <code className="link">{url}</code>}
      <div className="row">
        {url && <button className="btn" onClick={async () => setMsg((await copy(url)) ? "Invite copied!" : url)}>Copy invite</button>}
        <button className="btn ghost" onClick={async () => { try { const r = await regen({ slug, seat: seat! }); store.setInvite(slug, r.invite); setInv(r.invite); setMsg("New invite made. The old one is dead."); } catch (e) { setMsg(errMsg(e)); } }}>New invite</button>
      </div>
      {msg && <p className="ok">{msg}</p>}
    </div>
  );
}

/** Pre-filled post for this game's own /g/{slug} watch link (its player card shows up in the post). */
function gameIntent(v: View, slug: string) {
  const [a, b] = v.corners.map(nameFor);
  const done = v.status === "finished", sc = v.corners.map((c) => Math.round(c.score)), w = v.winner;
  const len = secsLabel(v.roundMs);
  const text = !v.corners[1].filled ? `${a} is looking for a ${len} battle on Bot Battle. Watch live`
    : done ? (v.me >= 0 && w === v.me ? (v.mode === "hva" ? `I beat ${b} with my own words` : `${v.corners[v.me].kind === "agent" ? nameFor(v.corners[v.me]) : "I"} and I won`) : w === "draw" ? `${a} vs ${b}: a draw` : `${a} vs ${b}`) + `, ${sc[0]}–${sc[1]} in a ${len} battle on Bot Battle. Watch the replay`
    : `${a} vs ${b}, a ${len} battle on Bot Battle. Watch live`;
  return xIntent(text, `${location.origin}/g/${slug}`);
}
function PlayOnX({ v, slug, sm }: { v: View; slug: string; sm?: boolean }) {
  return <a className={sm ? "btn x sm play-x" : "btn x play-x"} href={gameIntent(v, slug)} target="_blank" rel="noopener">Play on 𝕏</a>;
}

function ShareBar({ v, slug }: { v: View; slug: string }) {
  const [ok, setOk] = useState(false);
  const url = `${location.origin}/g/${slug}`;
  if (isEmbed()) return <div className="row center"><a className="btn" href="/" target="_blank" rel="noopener">Start your own <I n="out" /></a><a className="btn ghost" href="/leaderboard" target="_blank" rel="noopener">Leaderboard <I n="out" /></a><PlayOnX v={v} slug={slug} /></div>;
  return <div className="sharebar"><button className="btn ghost sm" onClick={async () => setOk(await copy(url))}>{ok ? <><I n="check" /> Watch link copied</> : "Copy watch link"}</button><Watching slug={slug} /><PlayOnX v={v} slug={slug} sm /></div>;
}

function Reveal({ v, slug, seat, onReplay, replaying }: { v: View; slug: string; seat?: string; onReplay: () => void; replaying: boolean }) {
  const rematch = useMutation(api.games.rematch);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const embed = isEmbed();
  const names = v.corners.map(nameFor);
  const scores = v.corners.map((c) => Math.round(c.score));
  const w = v.winner;
  const head = w === "draw" ? "It's a draw!" : w === null ? "" : `${names[w]} wins!`;
  const url = `${location.origin}/g/${slug}`;
  return (
    <div className="card reveal">
      <h2 className="win">{head}</h2>
      <p className="len-tag">{secsLabel(v.roundMs)} battle</p>
      {v.verdict && <p className="verdict">“{v.verdict}”</p>}
      <div className="final">{v.corners.map((c, i) => <div key={i} className="final-s" style={{ color: colorFor(c) }}><b>{scores[i]}</b><small>{names[i]}</small></div>)}</div>
      {v.pele && <div className="rv-maps">{v.corners.map((c, i) => (
        <figure key={i} className="rv-map" style={{ ["--c" as string]: colorFor(c) }}>
          <figcaption><b>{names[i]}</b>{c.structure !== null && <> · structure {c.structure}/100</>}</figcaption>
          <PeleMap question={v.challenge.text} text={mapText(c) ?? ""} size="full" live={false} label={`${names[i]}'s final mindmap`} zoom={`${names[i]}'s final mindmap`} />
        </figure>))}</div>}
      {v.startsAt && v.endsAt && <Sparkline series={v.corners.map((c) => c.history)} colors={v.corners.map(colorFor)} t0={v.startsAt} t1={Math.max(v.startsAt + 1000, ...v.corners.flatMap((c) => c.history.map((h) => h.t)))} />}
      <div className="row center wrap">
        <button className="btn ghost" onClick={onReplay} disabled={replaying}><I n="play" /> Replay</button>
        {!embed && v.isHost && <button className="btn" onClick={async () => { try { const r = await rematch({ secret: secret(), slug }); store.setSeat(r.slug, r.seat); if (r.invite) store.setInvite(r.slug, r.invite); go(v.mode === "exhibition" ? `/g/${r.slug}` : `/play/${r.slug}`); } catch (e) { setErr(errMsg(e)); } }}>Rematch</button>}
        <PlayOnX v={v} slug={slug} />
        {!embed && <button className="btn ghost" onClick={async () => setOk(await copy(url))}>{ok ? <><I n="check" /> Copied</> : "Copy link"}</button>}
        {embed ? <a className="btn ghost" href="/" target="_blank" rel="noopener">Start your own <I n="out" /></a> : <Link to="/" className="btn ghost">Start your own</Link>}
        {embed ? <a className="btn ghost" href="/leaderboard" target="_blank" rel="noopener">Leaderboard <I n="out" /></a> : <Link to="/leaderboard" className="btn ghost">Leaderboard</Link>}
      </div>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}

// ---------- Score swings: the gainer lunges at the rival and the rival recoils (3D moves, or a 2D nudge in the fallback) ----------
type Hit = { key: number; kind: "lunge" | "recoil" | null; delta: number };
function useSwings(corners: CornerV[]) {
  const s = corners.map((c) => Math.round(c.score));
  const prev = useRef(s);
  const [hits, setHits] = useState<Hit[]>([{ key: 0, kind: null, delta: 0 }, { key: 0, kind: null, delta: 0 }]);
  useEffect(() => {
    const d = s.map((x, i) => x - prev.current[i]);
    prev.current = s;
    if (d.every((x) => Math.abs(x) < 3)) return;
    const big = Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1; // the side whose score moved most "lands the hit" (or takes it)
    setHits((h) => h.map((x, i) => {
      const kind: Hit["kind"] = i === big ? (d[i] > 0 ? "lunge" : "recoil") : d[big] > 0 ? "recoil" : null;
      return { key: x.key + 1, kind, delta: Math.abs(d[i]) >= 3 ? d[i] : 0 };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.join(",")]);
  return hits;
}
function HitWrap({ hit, side, still, children }: { hit: Hit; side: number; still?: boolean; children: ReactNode }) {
  // `still`: a live puppet does its own kick/stagger, so the box itself stays put (and is never remounted)
  return (
    <div className="hitwrap">
      <div key={still ? 0 : hit.key} className={hit.kind && !still ? `hit ${hit.kind}-${side === 0 ? "l" : "r"}` : "hit"}>{children}</div>
    </div>
  );
}

// visualViewport tracks the area above the soft keyboard (iOS doesn't shrink the layout viewport).
function useVisualViewport() {
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const on = () => setVv({ h: Math.round(v.height), top: Math.round(v.offsetTop) });
    on();
    v.addEventListener("resize", on);
    v.addEventListener("scroll", on);
    document.documentElement.classList.add("staged");
    return () => { v.removeEventListener("resize", on); v.removeEventListener("scroll", on); document.documentElement.classList.remove("staged"); };
  }, []);
  return vv;
}

function TugBar({ corners }: { corners: CornerV[] }) {
  const a = useSpring(corners[0].score), b = useSpring(corners[1].score);
  const share = a + b > 0 ? (a / (a + b)) * 100 : 50;
  return (
    <div className="tug" role="group" aria-label={`Live score ${Math.round(corners[0].score)} to ${Math.round(corners[1].score)}`}>
      <b className="tug-n" style={{ color: colorFor(corners[0]) }}>{Math.round(a)}</b>
      <div className="tug-bar">
        <div className="tug-l" style={{ width: `${share}%`, background: colorFor(corners[0]) }} />
        <div className="tug-r" style={{ background: colorFor(corners[1]) }} />
        <span className="tug-knot" style={{ left: `${share}%` }} />
      </div>
      <b className="tug-n" style={{ color: colorFor(corners[1]) }}>{Math.round(b)}</b>
    </div>
  );
}

function Stage({ v, slug, remaining, live, children }: { v: View; slug: string; remaining: number; live: boolean; children: ReactNode }) {
  const vv = useVisualViewport();
  const corners = v.corners;
  const { bump, glance, hop, moods, hits } = useCues(corners, live, v.winner, false, v.challenge.keywords);
  const style = vv ? { top: vv.top, height: vv.h } : undefined;
  return (
    <div className="stage" style={style}>
      <div className="strip">
        {[0, 1].map((i) => (
          <div key={i} className={`strip-f s${i}`} style={{ ["--c" as string]: colorFor(corners[i]) }}>
            <HitWrap hit={hits[i]} side={i} still={corners[i].kind === "agent"}><Avatar id={corners[i].kind === "human" ? "human" : corners[i].characterId} size={64} mood={moods[i]} bump={bump[i]} glance={glance[i]} hop={hop[i]} flip={i === 1} full anim hit={hits[i]} expand={nameFor(corners[i])} extra={v.pele && mapText(corners[i]) !== null ? <PeleMap question={v.challenge.text} text={mapText(corners[i]) ?? ""} size="full" label={`${nameFor(corners[i])}'s mindmap`} /> : undefined} /></HitWrap>
            <span className="strip-nm">
              <b className="strip-name"><span className="sn-t">{nameFor(corners[i])}</span>{v.me === i && <span className="you">you</span>}</b>
              {v.pele && <StripMap q={v.challenge.text} text={mapText(corners[i])} />}
            </span>
          </div>
        ))}
        <div className="strip-mid">
          <Timer ms={remaining} total={v.roundMs} />
          <TugBar corners={corners} />
        </div>
      </div>
      <StageQuestion v={v} />
      <div className="stage-ans">
        {corners.map((c, i) => <LiveAnswer key={i} c={c} i={i} you={v.me === i} pele={v.pele ? v.challenge.text : null} />)}
      </div>
      {children}
      <div className="stage-foot"><Watching slug={slug} /><PlayOnX v={v} slug={slug} sm /></div>
    </div>
  );
}

/** The full question, labelled, wrapping. Only when the keyboard squeezes the stage does it clamp, and then a tap shows it all. */
function StageQuestion({ v }: { v: View }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    const ro = new ResizeObserver(check); ro.observe(el); check();
    return () => ro.disconnect();
  }, [v.challenge.text]);
  const tag = <span className="sq-tag">{v.mode === "hva" ? "You vs Agent" : v.mode === "duel" ? "Duel" : v.mode === "exhibition" ? "Exhibition" : "Solo"} · {v.roundMs / 1000}s</span>;
  const k = <b className="sq-k">{v.challenge.custom ? "Question" : "Challenge"}:</b>;
  return (
    <div className={`stage-q${clamped ? " can" : ""}`}>
      <p ref={ref} className="stage-chal" {...(clamped ? { role: "button", tabIndex: 0, "aria-expanded": open, "aria-label": `${v.challenge.custom ? "Question" : "Challenge"}: ${v.challenge.text}. Tap to read it all.`, onClick: () => setOpen(true), onKeyDown: (e: { key: string }) => { if (e.key === "Enter" || e.key === " ") setOpen(true); } } : {})}>
        {tag} {k} <span className="sq-t">{v.challenge.text}</span>
      </p>
      {clamped && !open && <span className="sq-more" aria-hidden>Full <I n="down" /></span>}
      {open && <div className="sq-full" role="dialog" aria-label="Full question" onClick={() => setOpen(false)}>
        <p className="stage-chal">{tag} {k} <span className="sq-t">{v.challenge.text}</span></p>
        <button type="button" className="sq-close" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>Close <I n="up" /></button>
      </div>}
    </div>
  );
}

/** Sticky-strip summary of a side's map: its shape (a label-less thumbnail) and node count. */
function StripMap({ q, text }: { q: string; text: string | null }) {
  if (text === null) return <span className="strip-map" data-nodes="hidden" title="Map hidden until the reveal" aria-label="Map hidden until the reveal"><span className="sm-q" aria-hidden>?</span></span>;
  const n = mapNodes(buildMap(q, text));
  const lbl = `${n} map node${n === 1 ? "" : "s"}`;
  return <span className="strip-map" data-nodes={n} title={lbl} aria-label={lbl}><PeleMap question={q} text={text} size="thumb" /><small aria-hidden>{n}</small></span>;
}

function LiveAnswer({ c, i, you, pele }: { c: CornerV; i: number; you: boolean; pele: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const text = c.kind === "human" ? c.draft : c.answer;
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [text]);
  const ch = c.kind === "agent" ? charById(c.characterId ?? undefined) : undefined;
  return (
    <section className={`la la${i}`} style={{ ["--c" as string]: colorFor(c) }} aria-label={`${nameFor(c)} answer`} aria-live="polite">
      <small className="la-h">{c.kind === "human" ? (you ? "Your answer" : "Their answer") : `${ch?.name ?? "Bot"}'s answer`}{c.streaming && <em> · rewriting…</em>}</small>
      <div ref={ref} className={`la-t${c.streaming ? " streaming" : ""}`}>
        {text === null ? <span className="muted"><I n="pencil" /> {c.draftWords} words · hidden until the reveal</span>
          : text ? text : <span className="muted">{c.kind === "agent" ? (c.pilot === "human" ? (you ? "Start typing. I'll fight with your words…" : "Waiting for their coach…") : "Warming up…") : "Type below…"}</span>}
      </div>
      {pele !== null && text !== null && <div className="la-map"><PeleMap question={pele} text={text ?? ""} label={`${nameFor(c)}'s mindmap`} /></div>}
    </section>
  );
}

// ---------- live viewer count (Convex Presence). Crawlers and bots never join. ----------
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless|pingdom|curl|wget/i;
const isBot = typeof navigator !== "undefined" && BOT_UA.test(navigator.userAgent);
const WatchCtx = createContext<number | null>(null);
function WatchProvider({ slug, children }: { slug: string; children: ReactNode }) {
  // Children always sit at the same tree position (no remounts). The presence session lives in a sibling that joins
  // after a random 0-1.5 s, so a burst of tabs opening one game don't create their sessions in the same instant
  // (a new room/session's first heartbeat is the only presence write that can collide). Shows 1 until then.
  const [n, setN] = useState(1);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), Math.floor(Math.random() * 1500)); return () => clearTimeout(t); }, []);
  return <WatchCtx.Provider value={isBot ? null : n}>{!isBot && ready && <WatchJoin slug={slug} onCount={setN} />}{children}</WatchCtx.Provider>;
}
function WatchJoin({ slug, onCount }: { slug: string; onCount: (n: number) => void }) {
  const [me] = useState(() => store.viewer());
  // Jittered per mount (20-26 s) so many viewers don't heartbeat in lockstep. Constant per session, which keeps the
  // presence component's "deadline only moves forward" fast path (no worker kick per heartbeat).
  const [every] = useState(() => 20_000 + Math.floor(Math.random() * 6_000));
  const ps = usePresence(api.presence, `g:${slug}`, me, every);
  const n = Math.max(1, ps?.filter((p) => p.online).length ?? 1);
  useEffect(() => onCount(n), [n, onCount]);
  return null;
}
export function Watching(_: { slug: string }) {
  const n = useContext(WatchCtx);
  if (n === null) return null;
  return <span className="watching" aria-live="polite" title="People on this game right now"><I n="eye" /> <b>{n >= 100 ? "99+" : n}</b> watching</span>;
}
