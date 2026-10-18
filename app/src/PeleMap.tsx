import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import { createPortal } from "react-dom";
import { I } from "./icons";
import { buildMap, mapNodes, toMermaid } from "../convex/mindmap";

// Pele (pele.run, obsidianmd/pele, MIT) is only fetched when a Pele-mode game is on screen: core + the mindmap type.
type Render = (src: string, o: object) => { svg: string; width: number; height: number };
let loading: Promise<Render> | null = null;
const loadPele = () => (loading ??= Promise.all([import("pele/core"), import("pele/diagrams/mindmap")]).then(([core, mm]) => { core.register(mm.default); return core.render as Render; }));
export const usePele = (on: boolean) => {
  const [r, setR] = useState<Render | null>(null);
  useEffect(() => { if (on) loadPele().then((f) => setR(() => f), () => {}); }, [on]);
  return r;
};

const OPTS = { autoDirection: false, links: false, images: false, padding: 6 };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One side's mindmap, built from finished words only. `size`: "box" (battle box), "full" (expand / reveal), "thumb" (strip shape),
 *  "modal" (the zoomable full-screen view). `zoom` (a title) makes a finished map tappable: it opens in PeleModal. */
export function PeleMap({ question, text, size = "box", live = true, label, zoom }: { question: string; text: string; size?: "box" | "full" | "thumb" | "modal"; live?: boolean; label?: string; zoom?: string }) {
  const render = usePele(true);
  const host = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const drawn = useRef(false);
  const model = useMemo(() => buildMap(question, text, live), [question, text, live]);
  const src = toMermaid(model), n = mapNodes(model);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = host.current; if (!el || size === "thumb") return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el); return () => ro.disconnect();
  }, [size]);
  const empty = n === 0;
  useEffect(() => {
    const el = host.current; if (!el || !render) return;
    if (empty && size !== "thumb") { el.innerHTML = ""; seen.current = new Set(); return; }
    try {
      const out = render(src, { ...OPTS, fontSize: size === "modal" ? 18 : size === "full" ? 15 : 13, maxWidth: size === "thumb" ? 400 : size === "modal" ? Math.max(320, Math.min(1200, w || el.clientWidth || 900)) : Math.max(200, w || el.clientWidth || 320) });
      el.innerHTML = out.svg;
      // pop-in: labels that weren't in the previous render (not on the first draw, never with reduced motion)
      const anim = !reduced() && size !== "thumb" && drawn.current;
      const now = new Set<string>();
      for (const t of el.querySelectorAll("text")) {
        const k = t.textContent ?? "";
        if (anim && !seen.current.has(k)) t.closest("g")?.classList.add("pm-new");
        now.add(k);
      }
      seen.current = now; drawn.current = true;
      el.dataset.ok = "1";
    } catch { /* keep the last good map */ }
  }, [render, src, size, w, empty]);
  const [open, setOpen] = useState(false);
  const canZoom = !!zoom && !empty && size !== "thumb" && size !== "modal";
  const lbl = label ?? `Mindmap, ${n} nodes`;
  return (
    <>
      <div className={`pm pm-${size}${empty && size !== "thumb" ? " empty" : ""}${canZoom ? " pm-zoomable" : ""}`} data-nodes={n}
        {...(canZoom ? { role: "button", tabIndex: 0, "aria-label": `${lbl}. Open full screen`, title: "Tap to open full screen", onClick: () => setOpen(true), onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } } } : { role: "img", "aria-label": lbl })}>
        {empty && size !== "thumb" && <span className="pm-root">{model.root}</span>}
        <div ref={host} className="pm-svg" />
        {size !== "thumb" && empty && <span className="pm-empty muted">The map grows with every word</span>}
        {canZoom && <span className="pm-zoom-hint" aria-hidden><I n="expand" /></span>}
      </div>
      {open && <PeleModal title={zoom!} question={question} text={text} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Full-screen map after the game: pinch / wheel to zoom, drag to pan, double-tap to reset, ✕ or Esc to close. */
export function PeleModal({ title, question, text, onClose }: { title: string; question: string; text: string; onClose: () => void }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const clamp = (s: number) => Math.min(5, Math.max(0.5, s));
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "+" || e.key === "=") setT((v) => ({ ...v, s: clamp(v.s * 1.25) })); if (e.key === "-") setT((v) => ({ ...v, s: clamp(v.s / 1.25) })); if (e.key === "0") setT({ s: 1, x: 0, y: 0 }); };
    addEventListener("keydown", k);
    const ov = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { removeEventListener("keydown", k); document.body.style.overflow = ov; prev?.focus?.(); };
  }, [onClose]);
  const dist = () => { const [a, b] = [...pts.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const down = (e: RPE) => { try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ } pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.current.size === 2) pinch.current = { d: dist(), s: t.s }; };
  const move = (e: RPE) => {
    const p = pts.current.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size >= 2 && pinch.current) { const s = clamp(pinch.current.s * (dist() / pinch.current.d)); setT((v) => ({ ...v, s })); }
    else setT((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const up = (e: RPE) => { pts.current.delete(e.pointerId); if (pts.current.size < 2) pinch.current = null; };
  return createPortal(
    <div className="pmm" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pmm-bar">
        <b>{title}</b>
        <span className="pmm-tools">
          <button type="button" className="pmm-b" aria-label="Zoom out" onClick={() => setT((v) => ({ ...v, s: clamp(v.s / 1.25) }))}><I n="minus" /></button>
          <button type="button" className="pmm-b pmm-pct" aria-label="Reset zoom" onClick={() => setT({ s: 1, x: 0, y: 0 })}>{Math.round(t.s * 100)}%</button>
          <button type="button" className="pmm-b" aria-label="Zoom in" onClick={() => setT((v) => ({ ...v, s: clamp(v.s * 1.25) }))}><I n="plus" /></button>
          <button ref={closeRef} type="button" className="pmm-b pmm-x" aria-label="Close" onClick={onClose}><I n="x" /></button>
        </span>
      </div>
      <div className="pmm-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => setT({ s: 1, x: 0, y: 0 })}
        onWheel={(e) => setT((v) => ({ ...v, s: clamp(v.s * (e.deltaY < 0 ? 1.1 : 1 / 1.1)) }))}>
        <div className="pmm-in" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }} data-scale={t.s.toFixed(2)}>
          <PeleMap question={question} text={text} size="modal" live={false} label={title} />
        </div>
      </div>
      <p className="pmm-help">Pinch or scroll to zoom · drag to move · double-tap to reset</p>
    </div>,
    document.body,
  );
}
