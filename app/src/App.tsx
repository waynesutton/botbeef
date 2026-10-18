import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buzz } from "./haptics";
import { I, Logo } from "./icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { ROSTER, MODES, RANDOM, ALLOW_MIRROR, DURATIONS, DEFAULT_MS, isDuration, type Mode, charById, isActive, QUESTION_SUGGESTIONS, QUESTION_MAX, QUESTION_MIN, cleanQuestion, modelOptions, modelFor } from "../convex/config";
import { localCheck } from "../convex/moderation";
import { Avatar, Footer, Link, Nav } from "./ui";
import { ABOUT, BENCH, FAQ, HOW } from "../convex/seo";
import { go, useLocation, isEmbed } from "./nav";
import { errMsg, secret, store } from "./local";
import { Game } from "./Game";
import { Leaderboard } from "./Leaderboard";
import { Bots } from "./Bots";

export function App() {
  const { path } = useLocation();
  const [how, setHow] = useState(false);
  const embed = isEmbed();
  let page;
  let m;
  if ((m = path.match(/^\/(play|g)\/([0-9A-Za-z]{10})\/?$/))) page = <Game key={m[2]} slug={m[2]} asPlayer={m[1] === "play"} />;
  else if ((m = path.match(/^\/j\/([A-Za-z0-9_-]+)\/?$/))) page = <Invite token={m[1]} />;
  else if (path.startsWith("/leaderboard")) page = <Leaderboard />;
  else if (path === "/bots" || path === "/bots/") page = <Bots />;
  else if (path === "/in-tweet") page = <InTweet />;
  else page = <Home />;
  if (embed) return <div className="embed">{page}<Footer compact /></div>;
  return (
    <>
    <header className="nav-bar"><Nav onHow={() => setHow(true)} /></header>
    <div className="app">
      <main>{page}</main>
      <Footer />
      {how && <HowItWorks onClose={() => setHow(false)} />}
    </div>
    </>
  );
}

/** A bot already claimed by the other side: stays in its grid slot, greyed, ringed in the owner's color and labelled. */
type Taken = { id: string; tag: string; who: string; color: string; locked: boolean } | null;
const P1 = "#ff5a36", P2 = "#7c3aed";
/** Character select. Every bot always shows, in a fixed order: a taken one is greyed and (when mirrors aren't allowed) not selectable. */
type Models = Record<string, string>;
function CharPicker({ value, onChange, taken = null, random, label = "Your character", models, onModel }: { value: string; onChange: (id: string) => void; taken?: Taken; random?: boolean; label?: string; models?: Models; onModel?: (id: string, model: string) => void }) {
  const [sheet, setSheet] = useState<string | null>(null);
  // Long-press (mobile) opens the model sheet; the click that ends the press is swallowed.
  const press = useRef<{ t: number; fired: boolean } | null>(null);
  const down = (id: string) => (e: React.PointerEvent) => {
    if (!onModel || e.button > 0) return;
    const p = { t: 0, fired: false };
    p.t = window.setTimeout(() => { p.fired = true; buzz("select"); setSheet(id); }, 500);
    press.current = p;
  };
  const cancel = () => { if (press.current) clearTimeout(press.current.t); };
  const pick = (id: string) => { if (press.current?.fired) { press.current = null; return; } buzz("select"); onChange(id); };
  return (
    <>
    <div className={onModel ? "chars swap" : "chars"} role="radiogroup" aria-label={label}>
      {random && (
        <button role="radio" aria-checked={value === RANDOM} className={value === RANDOM ? "char on rand" : "char rand"} onClick={() => pick(RANDOM)} style={{ ["--c" as string]: "#7c3aed" }}>
          <span className="dice" aria-hidden>🎲</span><b>Random</b><small>Let the game pick</small>
        </button>
      )}
      {ROSTER.map((c) => {
        const t = taken && taken.id === c.id ? taken : null;
        const off = !!t?.locked;
        const opts = onModel && !off ? modelOptions(c.id) : [];
        const chosen = opts.length ? modelFor(c.id, models?.[c.id]) : null;
        return (
          <div key={c.id} className="char-w">
          <button role="radio" aria-checked={value === c.id && !off} aria-disabled={off || undefined} disabled={off} data-id={c.id}
            className={`char${value === c.id && !off ? " on" : ""}${t ? " taken" : ""}`} onClick={() => !off && pick(c.id)}
            onPointerDown={opts.length ? down(c.id) : undefined} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
            onContextMenu={opts.length ? (e) => e.preventDefault() : undefined}
            style={{ ["--c" as string]: c.color, ...(t ? { ["--own" as string]: t.color } : {}) }}
            aria-label={t ? `${c.name}, taken by ${t.who}` : undefined} title={t ? `Taken by ${t.who}` : undefined}>
            {t && <span className="tk" aria-hidden>{t.tag}</span>}
            <Avatar id={c.id} size={64} full />
            <b>{c.name}</b>
            <small>{t ? `Taken · ${t.who}` : c.vibe}</small>
            {chosen && models?.[c.id] && chosen.model !== modelOptions(c.id)[0].model && <span className="cm" data-model={chosen.model}>{chosen.label}</span>}
          </button>
          {opts.length > 0 && <button type="button" className="ci" aria-label={`Models for ${c.name}`} aria-haspopup="dialog" onClick={() => setSheet(c.id)}><I n="info" size={14} /></button>}
          </div>
        );
      })}
    </div>
    {sheet && onModel && <ModelSheet id={sheet} value={models?.[sheet]} onPick={(m) => { onModel(sheet, m); buzz("select"); setSheet(null); }} onClose={() => setSheet(null)} />}
    </>
  );
}

/** Slim bottom sheet: the models one bot can run on for this game. Default first; Esc, ✕ or the backdrop close it. */
function ModelSheet({ id, value, onPick, onClose }: { id: string; value?: string; onPick: (model: string) => void; onClose: () => void }) {
  const c = charById(id)!, opts = modelOptions(id), cur = modelFor(id, value).model;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k); first.current?.focus();
    return () => removeEventListener("keydown", k);
  }, []);
  return createPortal(
    <div className="msh-bg" onClick={onClose}>
      <div className="msh" role="dialog" aria-modal="true" aria-labelledby="msh-h" onClick={(e) => e.stopPropagation()} style={{ ["--c" as string]: c.color }}>
        <div className="msh-top">
          <span className="msh-av"><Avatar id={c.id} size={48} /></span>
          <div className="msh-tt"><b id="msh-h">{c.name} runs on</b><small>{opts.length > 1 ? "This game only. Same company, no deep thinking." : `${c.name} has one model that answers fast with thinking off on the gateway right now.`}</small></div>
          <button type="button" className="msh-x" aria-label="Close" onClick={onClose}><I n="x" size={18} /></button>
        </div>
        <div role="radiogroup" aria-label={`${c.name} model`} className="msh-list">
          {opts.map((o, i) => (
            <button key={o.model} ref={o.model === cur ? first : undefined} type="button" role="radio" aria-checked={o.model === cur} data-model={o.model} className={o.model === cur ? "msh-o on" : "msh-o"} onClick={() => onPick(o.model)}>
              <span className="msh-n">{o.label}{i === 0 && <em>Default</em>}</span>
              <small>{o.speed}{o.note ? ` · ${o.note}` : ""} · {o.model.replace(/^~/, "")}</small>
              {o.model === cur && <I n="check" size={16} />}
            </button>
          ))}
        </div>
      </div>
    </div>, document.body);
}

function Home() {
  const [name, setName] = useState(store.name());
  const [mode, setMode] = useState<Mode>(store.mode() as Mode);
  const [char, setChar] = useState(store.char());
  const [len, setLen] = useState<number>(() => (isDuration(store.len()) ? store.len() : DEFAULT_MS));
  // Exhibition: host fills both corners. "random" is allowed in either slot.
  const [ex, setEx] = useState<[string, string]>(() => [isActive(store.char()) ? store.char() : RANDOM, RANDOM]);
  const [slotI, setSlotI] = useState<0 | 1>(0);
  const pickSlot = (id: string) => { setEx((e) => (slotI === 0 ? [id, e[1]] : [e[0], id])); if (slotI === 0) setSlotI(1); };
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [pele, setPele] = useState(store.pele());
  const [models, setModels] = useState<Models>({}); // per-game model swap; kept in memory only
  const setModel = (id: string, m: string) => setModels((x) => ({ ...x, [id]: m }));
  const qClean = cleanQuestion(question);
  const qMod = qClean.length >= QUESTION_MIN ? localCheck(qClean) : { ok: true as const };
  const qBad = (qClean.length > 0 && qClean.length < QUESTION_MIN) || !qMod.ok;
  const start = useMutation(api.games.start);
  const me = useQuery(api.leaderboard.me, { secret: secret() });
  const go1 = async () => {
    setErr(""); setBusy(true); buzz("start");
    const mdl = (id: string | undefined) => (id && id !== RANDOM && models[id] && models[id] !== modelOptions(id)[0]?.model ? models[id] : undefined);
    try {
      store.setName(name); store.setMode(mode); store.setChar(char); store.setLen(len); store.setPele(pele);
      const r = await start(mode === "exhibition"
        ? { secret: secret(), name, mode, characterId: ex[0], opponentId: ex[1], roundMs: len, question: qClean || undefined, pele, model: mdl(ex[0]), opponentModel: mdl(ex[1]) }
        : { secret: secret(), name, mode, characterId: mode === "hva" ? undefined : char, roundMs: len, question: qClean || undefined, pele, model: mode === "hva" ? undefined : mdl(char) });
      if ("rejected" in r || !r.slug || !r.seat) { setErr("rejected" in r ? `${r.rejected.note} Try another question.` : "Try a different question."); setBusy(false); return; }
      store.setSeat(r.slug, r.seat);
      if (r.invite) store.setInvite(r.slug, r.invite);
      go(mode === "exhibition" ? `/g/${r.slug}` : `/play/${r.slug}`);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-row">{["grokbot", "musey", "dotty"].map((id, i) => <Avatar key={id} id={id} size={i === 1 ? 92 : 72} mood={i === 1 ? "smug" : "idle"} />)}</div>
        <h1>Who's got bars?</h1>
        <p className="sub">Quick AI battles: 15, 30 or 45 seconds. Coach a bot or type it yourself. Jev scores every word live, and anyone can watch.</p>
      </section>
      <section className="card form">
        <label className="lbl" htmlFor="nm">Your name</label>
        <input id="nm" className="inp" value={name} maxLength={20} placeholder="3 to 20 characters" onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        <div className="lbl">Mode</div>
        <div className="modes" role="radiogroup" aria-label="Mode">
          {MODES.map((x) => (
            <button key={x.id} role="radio" aria-checked={mode === x.id} className={mode === x.id ? "mode on" : "mode"} onClick={() => setMode(x.id)}>
              <b>{x.name}</b><small>{x.blurb}</small>
            </button>
          ))}
        </div>
        {mode !== "hva" && mode !== "exhibition" && <>
          <div className="lbl">Your character</div>
          <CharPicker value={char} onChange={setChar} models={models} onModel={setModel} />
        </>}
        {mode === "exhibition" && <>
          <div className="lbl">Pick both bots</div>
          <div className="slots" role="tablist" aria-label="Corners">
            {([0, 1] as const).map((i) => {
              const c = charById(ex[i]);
              return (
                <button key={i} role="tab" aria-selected={slotI === i} className={slotI === i ? `slot s${i} on` : `slot s${i}`} onClick={() => setSlotI(i)} style={{ ["--c" as string]: c?.color ?? "#7c3aed" }}>
                  {c ? <Avatar id={c.id} size={56} flip={i === 1} /> : <span className="dice" aria-hidden>🎲</span>}
                  <span><small>{i === 0 ? "Left corner" : "Right corner"}</small><b>{c?.name ?? "Random"}</b></span>
                </button>
              );
            })}
            <span className="slots-vs" aria-hidden>VS</span>
          </div>
          <CharPicker value={ex[slotI]} onChange={pickSlot} random models={models} onModel={setModel} label={slotI === 0 ? "Left corner bot" : "Right corner bot"}
            taken={ex[1 - slotI] === RANDOM ? null : { id: ex[1 - slotI], tag: slotI === 0 ? "P2" : "P1", who: slotI === 0 ? "Right corner" : "Left corner", color: slotI === 0 ? P2 : P1, locked: !ALLOW_MIRROR }} />
        </>}
        <QuestionField value={question} onChange={setQuestion} note={qMod.ok ? null : qMod.note} />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn big" disabled={busy || name.trim().length < 3 || qBad} onClick={go1}>{busy ? "Starting…" : `Start ${len / 1000}s battle`}</button>
        <div className="seg" role="radiogroup" aria-label="Game length">
          {DURATIONS.map((d) => <button key={d} role="radio" aria-checked={len === d} className={len === d ? "on" : ""} onClick={() => setLen(d)}>{d / 1000}s</button>)}
        </div>
        <button type="button" role="switch" aria-checked={pele} className={pele ? "pele-t on" : "pele-t"} onClick={() => setPele((p) => { store.setPele(!p); return !p; })} title="Every word you type draws or grows a live mindmap">
          <i aria-hidden /> Pele mode <small>· every word grows a mindmap</small>
        </button>
        {me && me.games > 0 && (
          <p className="mystats">You: <b>{me.name}#{me.tag}</b> · {me.wins}W {me.losses}L {me.draws}D · {me.weekPoints} Battle Points this week{me.needed > 0 && ` · ${me.needed} more game${me.needed > 1 ? "s" : ""} to rank`}</p>
        )}
      </section>
      <About />
    </div>
  );
}

/** Optional host-written question. Blank = Jev's auto question. Chips fill it in; Shuffle deals three more. */
function QuestionField({ value, onChange, note }: { value: string; onChange: (s: string) => void; note: string | null }) {
  // Player questions that passed both moderation layers join the built-in chips (interleaved, re-checked locally).
  const players = useQuery(api.rotation.suggestions) ?? [];
  const pool = useMemo(() => {
    const mine = players.filter((p) => localCheck(p).ok && !QUESTION_SUGGESTIONS.includes(p));
    const out: string[] = [];
    for (let i = 0; i < Math.max(mine.length, QUESTION_SUGGESTIONS.length); i++) { if (i < mine.length) out.push(mine[i]); if (i < QUESTION_SUGGESTIONS.length) out.push(QUESTION_SUGGESTIONS[i]); }
    return out;
  }, [players.join("\n")]);
  const fromPlayers = new Set(players);
  const [deal, setDeal] = useState(() => Math.floor(Math.random() * QUESTION_SUGGESTIONS.length));
  const step = Math.max(1, Math.floor(pool.length / 3));
  const chips = [...new Set([0, 1, 2].map((i) => pool[(deal + i * step) % pool.length]))];
  // The note waits a beat so it doesn't flash mid-word; Start is blocked immediately either way.
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => { if (!note) { setShown(null); return; } const t = setTimeout(() => setShown(note), 350); return () => clearTimeout(t); }, [note]);
  return (
    <div className="qf">
      <label className="lbl" htmlFor="q">Question <span className="muted">optional</span></label>
      <div className="qf-row">
        <input id="q" className={note ? "inp qf-in bad" : "inp qf-in"} aria-invalid={!!note} aria-describedby={note ? "q-note" : undefined} value={value} maxLength={QUESTION_MAX} placeholder="Blank = Jev picks one" onChange={(e) => onChange(e.target.value)} autoComplete="off" />
        {value && <button type="button" className="qf-x" aria-label="Clear question" onClick={() => onChange("")}>×</button>}
      </div>
      {note && shown && <p id="q-note" className="qf-note" role="alert">{shown} Try another question.</p>}
      <div className="qf-chips">
        {chips.map((c) => <button type="button" key={c} className={(value === c ? "chip on" : "chip") + (fromPlayers.has(c) ? " pq" : "")} title={fromPlayers.has(c) ? "From a player" : undefined} onClick={() => onChange(c)}>{fromPlayers.has(c) && <I n="user" className="pq-i" label="From a player" />}{c}</button>)}
        <button type="button" className="chip shuf" aria-label="Shuffle suggestions" onClick={() => setDeal((d) => (d + 1) % pool.length)}><I n="shuffle" /> Shuffle</button>
      </div>
    </div>
  );
}

/** Same copy the server renders for crawlers (convex/seo.ts), so what answer engines quote is what people see. */
function About() {
  return (
    <section className="card about" aria-labelledby="about-h">
      <h2 id="about-h">What is Bot Battle?</h2>
      <p>{ABOUT}</p>
      <h3>A better AI benchmark</h3>
      <p>{BENCH}</p>
      <h3>How to play</h3>
      <ol>{HOW.map((h) => <li key={h}>{h}</li>)}</ol>
      <h3>FAQ</h3>
      {FAQ.slice(2).filter((f) => f.a !== BENCH).map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
    </section>
  );
}

function Invite({ token }: { token: string }) {
  const peek = useQuery(api.games.peekInvite, { token });
  const claim = useMutation(api.games.claimInvite);
  const [name, setName] = useState(store.name());
  const [char, setChar] = useState(store.char());
  const [len, setLen] = useState<number>(() => (isDuration(store.len()) ? store.len() : DEFAULT_MS));
  // Exhibition: host fills both corners. "random" is allowed in either slot.
  const [ex, setEx] = useState<[string, string]>(() => [isActive(store.char()) ? store.char() : RANDOM, RANDOM]);
  const [slotI, setSlotI] = useState<0 | 1>(0);
  const pickSlot = (id: string) => { setEx((e) => (slotI === 0 ? [id, e[1]] : [e[0], id])); if (slotI === 0) setSlotI(1); };
  const [err, setErr] = useState("");
  const [models, setModels] = useState<Models>({});
  if (peek === undefined) return <div className="center muted">Loading…</div>;
  if (peek.state !== "open") return (
    <div className="card center-card">
      <h2>{peek.state === "taken" ? "This seat is taken." : peek.state === "expired" ? "This invite expired." : "This invite isn't valid."}</h2>
      {peek.slug && <p><Link to={`/g/${peek.slug}`} className="btn">Watch the battle</Link></p>}
      <p><Link to="/" className="btn ghost">Start your own</Link></p>
    </div>
  );
  const pick = char === peek.hostCharacter || !isActive(char) ? ROSTER.find((c) => c.id !== peek.hostCharacter)!.id : char;
  return (
    <div className="card form">
      <div className="hero-row"><Avatar id={peek.hostCharacter} size={80} mood="smug" /></div>
      <h2 className="center">{peek.hostName} called you out</h2>
      <p className="sub center">Their {charById(peek.hostCharacter ?? undefined)?.name ?? "bot"} vs your bot. You coach yours with a prompt for {peek.roundMs / 1000} seconds. You only see your own prompt until the reveal.{peek.pele && " Pele mode is on: every word grows your bot's mindmap."}</p>
      {peek.question && <p className="inv-q"><span>Their question</span>{peek.question}</p>}
      <label className="lbl" htmlFor="nm2">Your name</label>
      <input id="nm2" className="inp" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
      <div className="lbl">Your character</div>
      <CharPicker value={pick} onChange={setChar} taken={peek.hostCharacter ? { id: peek.hostCharacter, tag: "P1", who: peek.hostName ?? "Host", color: P1, locked: true } : null} models={models} onModel={(id, m) => setModels((x) => ({ ...x, [id]: m }))} />
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn big" disabled={name.trim().length < 3} onClick={async () => {
        try {
          store.setName(name); store.setChar(pick); buzz("start");
          const m = models[pick] && models[pick] !== modelOptions(pick)[0]?.model ? models[pick] : undefined;
          const r = await claim({ token, secret: secret(), name, characterId: pick, model: m });
          store.setSeat(r.slug, r.seat);
          go(`/play/${r.slug}`);
        } catch (e) { setErr(errMsg(e)); }
      }}>Accept the battle</button>
    </div>
  );
}

function InTweet() {
  const recent = useQuery(api.leaderboard.recent, {});
  return (
    <div className="it">
      <div className="it-top"><Logo size={28} /> <b>Bot Battle</b></div>
      <div className="hero-row">{["grokbot", "musey", "dotty", "sparkle"].map((id) => <Avatar key={id} id={id} size={64} />)}</div>
      <h1>Who's got bars?</h1>
      <p className="sub">15, 30 or 45-second AI battles, scored live by Jev. Coach a bot, or beat one with your own words.</p>
      <div className="row center">
        <a className="btn" href="/" target="_blank" rel="noopener">Start a battle <I n="out" /></a>
        <a className="btn ghost" href="/leaderboard" target="_blank" rel="noopener">Leaderboard <I n="out" /></a>
      </div>
      {recent && recent.length > 0 && <ul className="it-recent">{recent.slice(0, 3).map((r) => (
        <li key={r.slug}><a href={`/g/${r.slug}`} target="_blank" rel="noopener">{r.corners[0].name} {r.scores[0]}–{r.scores[1]} {r.corners[1].name}</a></li>
      ))}</ul>}
    </div>
  );
}

function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="How it works" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h2>How Bot Battle works</h2>
        <ol>
          <li>Enter a name, pick a mode, tap Start. No sign-up.</li>
          <li>A challenge appears. You get 15, 30 or 45 seconds (you pick it under Start; 30 by default).</li>
          <li><b>Solo:</b> type a prompt that coaches your bot. It rewrites its answer as you type. <b>You vs Agent:</b> type the answer yourself.</li>
          <li>Jev, a fast decision model, re-scores both sides about every 1.5 seconds. That live score is the final score. Higher score wins.</li>
          <li>Share your game's link. Anyone can watch live or replay it later. Wins earn Battle Points on the weekly leaderboard.</li>
        </ol>
        <p className="muted">Trying to sweet-talk the judge gets penalized. Every AI call runs through the Convex AI Gateway.</p>
        <button className="btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
