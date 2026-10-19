import { JUDGE } from "../convex/bots";
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { I, Logo } from "./icons";
import { charById, HUMAN, LEADERBOARD_PATH } from "../convex/config";
import { go, isEmbed } from "./nav";
import { store } from "./local";
import { PuppetView, ExpandView } from "./PuppetView";
import { hasRig } from "./puppet";

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const embed = isEmbed();
  const onClick = (e: MouseEvent) => {
    if (embed || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    go(to);
  };
  return <a href={to} className={className} onClick={onClick} {...(embed ? { target: "_blank", rel: "noopener" } : {})}>{children}</a>;
}

export type Mood = "idle" | "typing" | "excited" | "smug" | "worried" | "focused" | "win" | "lose";

// Characters with full-body (head-to-feet) art at public/c/{art}.full.v1.webp.
const FULL = new Set(["jev", "grokbot", "musey", "dotty", "sparkle", "deepy", "clawd", "kimmy", "hermy", "hunch", "zozo", "townsy", "pinchy", "house"]);

/** Plush avatar. `full` uses the head-to-feet art; `anim` turns it into a live cut-out puppet whose moves follow the cues:
 * bump = word typed (nod, a hip step every 4th word), hop = keyword hit (jump), hit = score swing (kick / stagger), mood = base loop.
 * `expand` (a display name) makes the puppet tappable into a big 2D view. */
export function Avatar({ id, size = 96, mood = "idle", bump = 0, glance = 0, hop = 0, flip, full, anim, hit, expand, extra }: { id: string | null; size?: number; mood?: Mood; bump?: number; glance?: number; hop?: number; flip?: boolean; full?: boolean; anim?: boolean; hit?: { key: number; kind: "lunge" | "recoil" | null }; expand?: string; extra?: ReactNode }) {
  const c = id === "human" ? null : id === "jev" ? JUDGE : charById(id ?? undefined);
  const color = c?.color ?? HUMAN.color;
  const art = c ? c.art ?? c.id : null;
  const body = !!(full && art && FULL.has(art));
  const src = id === "human" ? "/c/human.v1.webp" : art ? `/c/${art}.${body ? "full." : ""}v1.webp` : null;
  const rig = body && anim && hasRig(art) ? art : null;
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const tap = !!(rig && ready && expand);
  return (
    <div className={`av mood-${mood}${body ? " full" : ""}${flip ? " flip" : ""}${rig && ready ? " pup" : ""}${tap ? " tap" : ""}`} style={{ width: size, height: size, ["--ring" as string]: color }}
      data-rig={rig ?? undefined} {...(tap ? { role: "button", tabIndex: 0, "aria-label": `See ${expand} up close`, onClick: () => setOpen(true), onKeyDown: (e: { key: string }) => { if (e.key === "Enter" || e.key === " ") setOpen(true); } } : {})}>
      <div className="av-pose"><div key={rig ? "h" : `h${hop}`} className={hop && !rig ? "av-hop hop" : "av-hop"}>
      <div key={rig ? "b" : `b${bump}`} className={bump && !rig ? "av-in nod" : "av-in"}>
        <div key={rig ? "g" : `g${glance}`} className={glance && !rig ? `av-face glance${flip ? " r" : ""}` : "av-face"}>
          {rig && ready && <div className="pp-bg" style={{ backgroundImage: `url(/c/rig/${rig}.plate.v1.webp)` }} />}
          {src ? <img src={src} alt={c?.name ?? "Human"} width={size} height={size} draggable={false} decoding="async" /> : <span className="av-q">?</span>}
          {rig && <PuppetView art={rig} mood={mood} bump={bump} hop={hop} hit={hit} dir={flip ? -1 : 1} onReady={setReady} />}
        </div>
      </div>
      </div></div>
      {open && rig && <ExpandView art={rig} name={expand ?? c?.name ?? ""} color={color} extra={extra} onClose={() => setOpen(false)} />}
    </div>
  );
}

// Eases the shown number toward the live score (spring-ish), so swings feel physical.
export function useSpring(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { cur.current = target; setV(target); return; }
    let raf = 0;
    const step = () => {
      const d = target - cur.current;
      if (Math.abs(d) < 0.05) { cur.current = target; setV(target); return; }
      cur.current += d * 0.12;
      setV(cur.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

export function Meter({ score, color, align = "left", final }: { score: number; color: string; align?: "left" | "right"; final?: boolean }) {
  const v = useSpring(score);
  return (
    <div className={`meter ${align}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(score)} aria-label="Live score">
      <div className="meter-bar"><div className="meter-fill" style={{ width: `${v}%`, background: color }} /></div>
      <div className="meter-num">{Math.round(v)}{final && <small> final</small>}</div>
    </div>
  );
}

export function Sparkline({ series, colors, t0, t1 }: { series: { t: number; s: number }[][]; colors: string[]; t0: number; t1: number }) {
  const W = 300, H = 70;
  const span = Math.max(1, t1 - t0);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-label="Score history">
      {series.map((pts, i) => (
        <polyline key={i} fill="none" stroke={colors[i]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
          points={[{ t: t0, s: 0 }, ...pts].map((p) => `${(((p.t - t0) / span) * W).toFixed(1)},${(H - 4 - (p.s / 100) * (H - 8)).toFixed(1)}`).join(" ")} />
      ))}
    </svg>
  );
}

/** X compose intent; X renders the player card from the URL's twitter:player tags. */
/** X share intent. twitter.com/intent/tweet is the documented Web Intent and a Universal/App Link the X apps claim (app if installed, web composer otherwise); x.com/intent/post can bounce phones to an in-app browser/App Store loop. Always a plain <a target=_blank>. */
export const xIntent = (text: string, url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
export const SITE_SHARE = "Who's got bars? Pick an AI, coach it live, and out-argue another bot in 30 seconds.";

export function Footer({ compact }: { compact?: boolean }) {
  const ext = { target: "_blank", rel: "noopener" };
  return (
    <footer className={compact ? "foot compact" : "foot"}>
      <p>
        Built by <a href="https://waynesutton.ai" {...ext}>waynesutton.ai</a> · Built with <a href="https://convex.dev" {...ext}>Convex</a> · <a href="https://x.com/bot" {...ext}>Grok Bot</a> · <a className="foot-x" href={xIntent(SITE_SHARE, `${location.origin}/in-tweet`)} {...ext}>Share on 𝕏</a>
        {!compact && <> · Pele mode maps by <a href="https://pele.run" {...ext}>Pele</a> from <a href="https://github.com/obsidianmd/pele" {...ext}>obsidianmd</a></>}
      </p>
      {!compact && <p className="foot-jev">Scoring by Jev from <a href="https://docs.typesafe.ai/" {...ext}>TypeSafe</a> via <a href="https://docs.convex.dev/ai-gateway/overview" {...ext}>Convex AI Gateway</a></p>}
      <p className="muted">Characters are fan-made parodies, not affiliated with or endorsed by xAI, Meta, OpenAI, Google, Anthropic, DeepSeek, Moonshot, Nous Research, OpenClaw, Instinct, Zo Computer, Town or any AI company.</p>
    </footer>
  );
}

export function useTheme() {
  const [t, setT] = useState(() => store.theme() ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => { document.documentElement.dataset.theme = t; }, [t]);
  return [t, () => { const n = t === "dark" ? "light" : "dark"; store.setTheme(n); setT(n); }] as const;
}

export function Nav({ onHow }: { onHow: () => void }) {
  const [t, toggle] = useTheme();
  return (
    <nav className="nav">
      <Link to="/" className="logo"><Logo size={30} /> Bot Battle</Link>
      <div className="nav-r">
        <Link to="/bots" className="nav-a">Bots</Link>
        <Link to={LEADERBOARD_PATH} className="nav-a">Leaderboard</Link>
        <button className="nav-a ghost" onClick={onHow}>How it works</button>
        <button className="icon" onClick={toggle} aria-label={t === "dark" ? "Switch to light mode" : "Switch to dark mode"}><I n={t === "dark" ? "sun" : "moon"} size={18} /></button>
      </div>
    </nav>
  );
}

export function useNow(ms = 100, on = true) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { if (!on) return; const i = setInterval(() => setN(Date.now()), ms); return () => clearInterval(i); }, [ms, on]);
  return n;
}

export function copy(text: string) {
  return navigator.clipboard?.writeText(text).then(() => true, () => false) ?? Promise.resolve(false);
}
export const nameFor = (c: { kind: string; characterId: string | null; name: string | null; tag: string | null }) =>
  c.kind === "human" ? `${c.name ?? "Human"}` : charById(c.characterId ?? undefined)?.name ?? "???";
export const colorFor = (c: { kind: string; characterId: string | null }) => (c.kind === "human" ? HUMAN.color : charById(c.characterId ?? undefined)?.color ?? "#999");
