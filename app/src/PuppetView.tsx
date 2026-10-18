import { buzz } from "./haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { I } from "./icons";
import { createPortal } from "react-dom";
import { Puppet, type Base, type Move } from "./puppet";
import type { Mood } from "./ui";

const baseFor = (m: Mood): Base => (m === "typing" ? "type" : m === "smug" || m === "excited" ? "dance" : m === "worried" ? "worry" : m === "win" ? "victory" : m === "lose" ? "sad" : "idle");

/** Live puppet inside an avatar box. Typing and score cues drive the moves (see the mapping in SETUP_LOG). */
export function PuppetView({ art, mood, bump, hop, hit, dir, onReady }: { art: string; mood: Mood; bump: number; hop: number; hit?: { key: number; kind: "lunge" | "recoil" | null }; dir: number; onReady: (ok: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const pup = useRef<Puppet | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const el = host.current; if (!el) return;
    let live = true;
    const img = new Image(); img.src = `/c/rig/${art}.atlas.v1.webp`;
    img.decode().then(() => {
      if (!live) return;
      pup.current = new Puppet(el, art, { dir });
      const b = baseFor(mood);
      if (mood === "lose") pup.current.pose("sad", 0), pup.current.setBase("sad", true); else pup.current.setBase(b, true);
      onReady(true);
    }, () => onReady(false));
    return () => { live = false; pup.current?.destroy(); pup.current = null; onReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, dir]);
  const prevMood = useRef(mood);
  useEffect(() => {
    const p = pup.current; if (!p) { prevMood.current = mood; return; }
    const was = prevMood.current; prevMood.current = mood;
    if (mood === "lose" && was !== "lose") { p.setBase("sad"); p.play("lose"); return; }
    if (mood === "win" && was !== "win") { p.setBase("victory"); p.play("cheer"); return; }
    p.setBase(baseFor(mood));
  }, [mood]);
  useEffect(() => { if (first.current) return; const p = pup.current; if (!p || !bump) return; p.play("nod"); if (bump % 4 === 0) p.play("step"); }, [bump]);
  useEffect(() => { if (first.current) return; if (hop) pup.current?.play("jump"); }, [hop]);
  useEffect(() => { if (first.current) return; if (hit?.kind) pup.current?.play(hit.kind === "lunge" ? "kick" : "hit"); }, [hit?.key]);
  useEffect(() => { first.current = false; }, []);
  return <div ref={host} className="pp-host" />;
}

const CYCLES: Record<string, (Base | Move)[]> = {
  _: ["cheer", "jump", "kick", "dance", "nod", "type", "lose", "victory"],
  jev: ["gavel", "score", "nod", "cheer", "dance", "jump"], // the judge: gavel bang, score flip, nod
};
const LABEL: Record<string, string> = { cheer: "Cheer", jump: "Jump", kick: "Kick", dance: "Dance", nod: "Nod", type: "Type", lose: "Lose", victory: "Victory lap", idle: "Idle", sad: "Sad", gavel: "Gavel bang", score: "Score flip" };

/** Full-screen 2D view of one character. Tap the stage to cycle moves; ✕ or Esc closes. */
export function ExpandView({ art, name, color, extra, onClose }: { art: string; name: string; color: string; extra?: ReactNode; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const pup = useRef<Puppet | null>(null);
  const [i, setI] = useState(0);
  const CYCLE = CYCLES[art] ?? CYCLES._;
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const el = host.current; if (!el) return;
    pup.current = new Puppet(el, art, { dir: 1 }); pup.current.play((CYCLES[art] ?? CYCLES._)[0] as Move);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    addEventListener("keydown", k);
    return () => { removeEventListener("keydown", k); pup.current?.destroy(); };
  }, [art]);
  const next = () => {
    const p = pup.current; if (!p) return;
    buzz("tap");
    const n = (i + 1) % CYCLE.length; setI(n); const m = CYCLE[n];
    if (m === "type" || m === "dance" || m === "victory") { p.setBase(m as Base, true); }
    else { p.setBase("idle"); p.play(m as Move); }
  };
  const cur = CYCLE[i];
  return createPortal(
    <div className="xv" role="dialog" aria-modal="true" aria-label={`${name}, up close`} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="xv-card" style={{ ["--ring" as string]: color }} onClick={(e) => e.stopPropagation()}>
        <button className="xv-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}><I n="x" size={20} /></button>
        <button className="xv-stage" data-move={cur} aria-label={`Make ${name} move`} onClick={next}>
          <div className="pp-bg" style={{ backgroundImage: `url(/c/rig/${art}.plate.v1.webp)` }} />
          <div ref={host} className="pp-host" />
        </button>
        <p className="xv-cap"><b>{name}</b> · {LABEL[cur]} · tap for the next move</p>
        {extra && <div className="xv-extra">{extra}</div>}
      </div>
    </div>, document.body);
}
