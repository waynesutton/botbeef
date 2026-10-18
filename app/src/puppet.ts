// 2D cut-out plush puppets: each character's full-body art is split into layered parts (art/rig/split2.py) and
// animated with the Web Animations API. No libraries, no canvas/WebGL. Moves are computed from each rig's pivots.
import RIGS_JSON from "./rigs.gen.json";

type P = { n: string; kind: string; parent: string; z: number; x: number; y: number; w: number; h: number; ax: number; ay: number; aw: number; ah: number; pivot: [number, number]; hand?: [number, number] };
type Rig = { w: number; h: number; box: [number, number, number, number]; atlas: [number, number]; parts: P[]; eyes: [number, number][] };
const RIGS = RIGS_JSON as unknown as Record<string, Rig>;
export const RIG_KEYS = Object.keys(RIGS);
export const hasRig = (k: string | null | undefined): k is string => !!k && k in RIGS;
export type Base = "idle" | "type" | "dance" | "worry" | "sad" | "victory";
export type Move = "nod" | "cheer" | "jump" | "kick" | "lose" | "hit" | "step" | "gavel" | "score";
export const MOVES: (Base | Move)[] = ["idle", "type", "nod", "cheer", "jump", "kick", "dance", "hit", "worry", "lose", "sad", "victory", "gavel", "score"];

// keyframe value: r rotate deg, x/y translate % of the puppet canvas, sx/sy scale, o opacity, z z-index, e easing
type K = { r?: number; x?: number; y?: number; sx?: number; sy?: number; o?: number; z?: number; e?: string; t?: number };
type Track = { el: string; k: K[]; add?: boolean };
type Spec = { d: number; loop?: boolean; tracks: Track[] };

const tf = (k: K) => `translate(${k.x ?? 0}%, ${k.y ?? 0}%) rotate(${k.r ?? 0}deg) scale(${k.sx ?? 1}, ${k.sy ?? 1})`;
const S = (sy: number, y = 0): K => ({ sx: 1 + (1 - sy) * 0.6, sy, y });
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const deg = (a: number) => (a * 180) / Math.PI;
const norm = (a: number) => ((a + 540) % 360) - 180;

class Geo {
  aspect: number; parts: Record<string, P>; hip: [number, number]; foot: [number, number]; headPivot: [number, number]; kb: [number, number, number];
  constructor(public r: Rig) {
    this.aspect = r.w / r.h;
    this.parts = Object.fromEntries(r.parts.map((p) => [p.n, p]));
    const t = this.parts.torso; this.hip = t.pivot;
    const legs = r.parts.filter((p) => p.kind === "leg");
    this.foot = [t.pivot[0], legs.length ? Math.max(...legs.map((l) => l.y + l.h)) - 1 : 97];
    this.headPivot = this.parts.head?.pivot ?? [50, 45];
    const kbY = this.hip[1] - (this.hip[1] - this.headPivot[1]) * 0.18;
    this.kb = [t.pivot[0], kbY, 44];
  }
  /** rotation (deg, CSS clockwise) that swings an arm so its hand points at target (canvas %) */
  aim(arm: string, tx: number, ty: number) {
    const p = this.parts[arm]; if (!p?.hand) return 0;
    const [px, py] = p.pivot, [hx, hy] = p.hand;
    const ax = (u: number) => u * this.aspect; // % of width -> common units (height %)
    return norm(deg(Math.atan2(ty - py, ax(tx - px))) - deg(Math.atan2(hy - py, ax(hx - px))));
  }
  /** rotation that points the arm's hand along an absolute direction angle (deg, 0 = right, 90 = down) */
  dir(arm: string, a: number) {
    const p = this.parts[arm]; if (!p?.hand) return 0;
    return norm(a - deg(Math.atan2(p.hand[1] - p.pivot[1], (p.hand[0] - p.pivot[0]) * this.aspect)));
  }
}

function spec(g: Geo, name: Base | Move, dir: number): Spec {
  const L = "armL", R = "armR";
  const has = (n: string) => !!g.parts[n];
  // arm angles from the rig: typing hands on the keyboard, cheer straight up-and-out, eye wipe
  const [kx, ky, kw] = g.kb;
  const cap = (a: number) => Math.max(-80, Math.min(80, a));
  const tL = cap(g.aim(L, kx - kw * 0.16, ky)), tR = cap(g.aim(R, kx + kw * 0.16, ky));
  const upL = g.dir(L, -148), upR = g.dir(R, -32);
  const outL = g.dir(L, 165), outR = g.dir(R, 15);
  const hangL = g.dir(L, 98), hangR = g.dir(R, 82);
  const eye = g.r.eyes[1] ?? [55, 40];
  const wipe = g.aim(R, eye[0] + 2, eye[1] + 4);
  const ex = (kind: string, k: K[]) => g.r.parts.filter((p) => p.kind === kind).map((p) => ({ el: p.n, k: k.map((f) => ({ ...f, r: (f.r ?? 0) * (p.pivot[0] < 50 ? -1 : 1) })) }));
  const extras = (amp: number, n = 1): Track[] => [
    ...ex("bob", Array.from({ length: n * 2 + 1 }, (_, i) => ({ r: i % 2 ? amp : 0 }))),
    ...ex("flap", Array.from({ length: n * 2 + 1 }, (_, i) => ({ r: i % 2 ? -amp * 1.8 : 0 }))),
    ...ex("wag", Array.from({ length: n * 2 + 1 }, (_, i) => ({ r: i % 2 ? amp * 1.4 : -amp * 0.4 }))),
    ...ex("swing", Array.from({ length: n * 2 + 1 }, (_, i) => ({ r: i % 2 ? -amp * 0.7 : amp * 0.3 }))),
  ];
  const kbOff: Track = { el: "kb", k: [{ o: 0, sy: 0.6, y: 3 }, { o: 0, sy: 0.6, y: 3 }] };
  switch (name) {
    case "idle": return { d: 2600, loop: true, tracks: [
      { el: "root", k: [S(1), S(0.985, 0.3), S(1)] },
      { el: "upper", k: [{ r: 0 }, { r: 1.2 }, { r: 0 }] },
      { el: "head", k: [{ r: -1.5 }, { r: 2.5, y: 0.3 }, { r: -1.5 }] },
      { el: L, k: [{ r: 0 }, { r: 4 }, { r: 0 }] }, { el: R, k: [{ r: 0 }, { r: -4 }, { r: 0 }] },
      kbOff, ...extras(5) ] };
    case "type": {
      // arms forward and down onto the plush keyboard, alternating taps, head tilted down at it, tiny finger bobs
      const tap = (base: number, ph: number, sg: number): K[] => [0, 1, 2, 3, 4].map((i) => ({ r: base + ((i + ph) % 2 ? -4 : 2) * sg, y: (i + ph) % 2 ? 0.8 : -0.6, z: 46 }));
      return { d: 560, loop: true, tracks: [
        { el: "root", k: [S(0.99, 0.4), S(0.985, 0.6), S(0.99, 0.4)] },
        { el: "upper", k: [{ y: 1.2, sy: 0.985, r: 0 }, { y: 1.4, sy: 0.98, r: 0.6 }, { y: 1.2, sy: 0.985, r: 0 }] },
        { el: "head", k: [{ r: -3, y: 2.6, sy: 0.965 }, { r: -2, y: 3.1, sy: 0.96 }, { r: -3, y: 2.6, sy: 0.965 }] },
        { el: L, k: tap(tL, 0, 1) }, { el: R, k: tap(tR, 1, -1) },
        { el: "kb", k: [{ o: 1, y: 0 }, { o: 1, y: 0.25, sy: 0.985 }, { o: 1, y: 0 }] }, ...extras(3, 2) ] };
    }
    case "nod": return { d: 460, tracks: [ // quick positive double nod (additive, keeps the base move going)
      { el: "head", add: true, k: [{ y: 0 }, { y: 2.4, r: 1, sy: 0.97, e: "ease-in" }, { y: -0.6, sy: 1.02 }, { y: 1.6, sy: 0.98 }, { y: 0 }] },
      { el: "upper", add: true, k: [{ y: 0 }, { y: 0.5 }, { y: -0.4 }, { y: 0.3 }, { y: 0 }] } ] };
    case "gavel": return { d: 900, tracks: [ // Jev: wind the gavel arm up, BANG down, a little body bounce + approving nod
      { el: "root", k: [S(1), { ...S(1.02, -0.6), t: 0.3 }, { ...S(0.9, 1.6), t: 0.46, e: "cubic-bezier(.6,0,1,.6)" }, { ...S(1.03, -0.4), t: 0.6 }, S(1)] },
      { el: "upper", k: [{ r: 0 }, { r: 3, t: 0.3 }, { r: -4, y: 0.8, t: 0.46 }, { r: 0, t: 0.7 }, { r: 0 }] },
      { el: "head", k: [{ r: 0 }, { r: 4, y: -0.6, t: 0.3 }, { r: -2, y: 1.8, t: 0.48 }, { r: 0, y: 0.4, t: 0.66 }, { r: 0 }] },
      { el: L, k: [{ r: 0 }, { r: g.dir(L, -120), t: 0.3, e: "ease-out" }, { r: g.dir(L, 120), t: 0.46, e: "cubic-bezier(.7,0,1,.4)" }, { r: g.dir(L, 105), t: 0.56 }, { r: g.dir(L, 115), t: 0.66 }, { r: 0 }] },
      { el: R, k: [{ r: 0 }, { r: -3, t: 0.46 }, { r: 0 }] },
      { el: "shadow", k: [{ sx: 1 }, { sx: 1.08, t: 0.46 }, { sx: 1 }] }, kbOff ] };
    case "score": return { d: 1200, tracks: [ // Jev: hoist the scorecard high and flip it (wrist wiggles), head tilts to read it
      { el: "root", k: [S(1), { ...S(0.96, 0.6), t: 0.15 }, { ...S(1.04, -2), t: 0.35, e: "ease-out" }, { ...S(1), t: 0.85 }, S(1)] },
      { el: "head", k: [{ r: 0 }, { r: 6, t: 0.35 }, { r: 8, y: -0.4, t: 0.6 }, { r: 4, t: 0.85 }, { r: 0 }] },
      { el: R, k: [{ r: 0 }, { r: upR * 0.9, t: 0.3, e: "ease-out" }, { r: upR * 0.9 + 18, t: 0.42 }, { r: upR * 0.9 - 14, t: 0.54 }, { r: upR * 0.9 + 12, t: 0.66 }, { r: upR * 0.9 - 6, t: 0.76 }, { r: upR * 0.9, t: 0.86 }, { r: 0 }] },
      { el: L, k: [{ r: 0 }, { r: outL * 0.25, t: 0.35 }, { r: 0 }] }, kbOff ] };
    case "step": return { d: 520, tracks: [ // little hip sway every 4th word (additive)
      { el: "root", add: true, k: [{ x: 0, r: 0 }, { x: 1.4 * dir, r: 2.5 * dir }, { x: 0, r: 0 }] } ] };
    case "cheer": return { d: 1400, tracks: [
      { el: "root", k: [S(1), S(0.86, 2), { ...S(1.08, -9), e: "ease-out" }, S(0.92, 1), { ...S(1.06, -7), e: "ease-out" }, S(0.95, 0.5), S(1)] },
      { el: "head", k: [{ r: 0 }, { r: 0, y: 1 }, { r: -6, y: -1 }, { r: 3 }, { r: -6, y: -1 }, { r: 2 }, { r: 0 }] },
      { el: L, k: [{ r: 0 }, { r: outL * 0.3 }, { r: upL }, { r: upL * 0.82 }, { r: upL }, { r: upL * 0.8 }, { r: 0 }] },
      { el: R, k: [{ r: 0 }, { r: outR * 0.3 }, { r: upR }, { r: upR * 0.82 }, { r: upR }, { r: upR * 0.8 }, { r: 0 }] },
      { el: "legL", k: [{ r: 0 }, { r: 0 }, { r: 8 }, { r: 0 }, { r: 8 }, { r: 0 }, { r: 0 }] },
      { el: "legR", k: [{ r: 0 }, { r: 0 }, { r: -8 }, { r: 0 }, { r: -8 }, { r: 0 }, { r: 0 }] },
      { el: "shadow", k: [{ sx: 1 }, { sx: 1.05 }, { sx: 0.7, o: 0.5 }, { sx: 1 }, { sx: 0.75, o: 0.55 }, { sx: 1 }, { sx: 1 }] },
      kbOff, ...extras(12, 3) ] };
    case "victory": return { d: 1300, loop: true, tracks: [
      { el: "root", k: [S(1), S(0.9, 1.4), { ...S(1.06, -6), e: "ease-out" }, S(1)] },
      { el: "head", k: [{ r: -3 }, { r: 2 }, { r: -5, y: -1 }, { r: -3 }] },
      { el: L, k: [{ r: upL * 0.85 }, { r: upL * 0.7 }, { r: upL }, { r: upL * 0.85 }] },
      { el: R, k: [{ r: upR * 0.85 }, { r: upR * 0.7 }, { r: upR }, { r: upR * 0.85 }] },
      { el: "shadow", k: [{ sx: 1 }, { sx: 1.04 }, { sx: 0.78, o: 0.55 }, { sx: 1 }] }, kbOff, ...extras(10, 2) ] };
    case "jump": return { d: 1050, tracks: [
      { el: "root", k: [S(1), { ...S(0.8, 3), t: 0.2 }, { ...S(1.1, -17), t: 0.45, e: "ease-out" }, { ...S(1, -12), t: 0.62, e: "ease-in" }, { ...S(0.85, 2), t: 0.8 }, { ...S(1), t: 1 }] },
      { el: "head", k: [{ r: 0 }, { r: 0, y: 1.5, t: 0.2 }, { r: -5, y: -1, t: 0.45 }, { r: 4, t: 0.62 }, { y: 1, t: 0.8 }, { r: 0, t: 1 }] },
      { el: L, k: [{ r: 0 }, { r: outL * 0.25, t: 0.2 }, { r: upL * 0.95, t: 0.45 }, { r: upL * 0.6, t: 0.62 }, { r: outL * 0.3, t: 0.8 }, { r: 0, t: 1 }] },
      { el: R, k: [{ r: 0 }, { r: outR * 0.25, t: 0.2 }, { r: upR * 0.95, t: 0.45 }, { r: upR * 0.6, t: 0.62 }, { r: outR * 0.3, t: 0.8 }, { r: 0, t: 1 }] },
      { el: "legL", k: [{ r: 0 }, { r: 0, t: 0.2 }, { r: 22, y: -2, t: 0.45 }, { r: 10, t: 0.62 }, { r: 0, t: 0.8 }, { r: 0, t: 1 }] },
      { el: "legR", k: [{ r: 0 }, { r: 0, t: 0.2 }, { r: -22, y: -2, t: 0.45 }, { r: -10, t: 0.62 }, { r: 0, t: 0.8 }, { r: 0, t: 1 }] },
      { el: "shadow", k: [{ sx: 1 }, { sx: 1.08, t: 0.2 }, { sx: 0.55, o: 0.4, t: 0.45 }, { sx: 0.65, o: 0.5, t: 0.62 }, { sx: 1.05, t: 0.8 }, { sx: 1, t: 1 }] },
      kbOff, ...extras(16, 2) ] };
    case "kick": { // kick toward the rival (dir +1 = to the right)
      const leg = dir > 0 ? "legR" : "legL", other = dir > 0 ? "legL" : "legR";
      return { d: 950, tracks: [
        { el: "root", k: [{ x: 0 }, { x: -1 * dir, y: 0.5, t: 0.25 }, { x: 2.5 * dir, y: -2, t: 0.45 }, { x: 1.5 * dir, t: 0.65 }, { x: 0, t: 1 }] },
        { el: "upper", k: [{ r: 0 }, { r: 3 * dir, t: 0.25 }, { r: -12 * dir, t: 0.45 }, { r: -8 * dir, t: 0.65 }, { r: 0, t: 1 }] },
        { el: "head", k: [{ r: 0 }, { r: 4 * dir, t: 0.25 }, { r: 8 * dir, t: 0.45 }, { r: 3 * dir, t: 0.65 }, { r: 0, t: 1 }] },
        { el: leg, k: [{ r: 0 }, { r: 18 * dir, t: 0.25 }, { r: -80 * dir, y: -3, t: 0.45, e: "cubic-bezier(.2,1.4,.4,1)" }, { r: -55 * dir, y: -2, t: 0.65 }, { r: 0, t: 1 }] },
        { el: other, k: [{ r: 0 }, { r: 0, t: 0.25 }, { r: 6 * dir, t: 0.45 }, { r: 3 * dir, t: 0.65 }, { r: 0, t: 1 }] },
        { el: L, k: [{ r: 0 }, { r: outL * 0.3, t: 0.25 }, { r: dir > 0 ? outL * 0.75 : tL * 0.7, t: 0.45 }, { r: outL * 0.35, t: 0.65 }, { r: 0, t: 1 }] },
        { el: R, k: [{ r: 0 }, { r: outR * 0.3, t: 0.25 }, { r: dir > 0 ? tR * 0.7 : outR * 0.75, t: 0.45 }, { r: outR * 0.35, t: 0.65 }, { r: 0, t: 1 }] },
        kbOff, ...extras(14, 2) ] };
    }
    case "hit": return { d: 650, tracks: [ // stagger away from the rival
      { el: "root", k: [{ x: 0 }, { x: -4 * dir, y: -0.5, t: 0.22, e: "ease-out" }, { x: -1.5 * dir, t: 0.55 }, { x: 0, t: 1 }] },
      { el: "upper", k: [{ r: 0 }, { r: -10 * dir, t: 0.22 }, { r: 4 * dir, t: 0.55 }, { r: 0, t: 1 }] },
      { el: "head", k: [{ r: 0 }, { r: -14 * dir, t: 0.22 }, { r: 5 * dir, t: 0.55 }, { r: 0, t: 1 }] },
      { el: L, k: [{ r: 0 }, { r: outL * 0.6, t: 0.22 }, { r: 0, t: 0.7 }, { r: 0, t: 1 }] },
      { el: R, k: [{ r: 0 }, { r: outR * 0.6, t: 0.22 }, { r: 0, t: 0.7 }, { r: 0, t: 1 }] }, kbOff, ...extras(12, 2) ] };
    case "dance": return { d: 1100, loop: true, tracks: [
      { el: "root", k: [{ x: -2, r: -3 }, { ...S(0.94, 0.6), x: 0 }, { x: 2, r: 3 }, { ...S(0.94, 0.6), x: 0 }, { x: -2, r: -3 }] },
      { el: "upper", k: [{ r: 4 }, { r: 0 }, { r: -4 }, { r: 0 }, { r: 4 }] },
      { el: "head", k: [{ r: -6 }, { r: 0, y: 0.6 }, { r: 6 }, { r: 0, y: 0.6 }, { r: -6 }] },
      { el: L, k: [{ r: upL * 0.9 }, { r: outL * 0.4 }, { r: upL * 0.25 }, { r: outL * 0.4 }, { r: upL * 0.9 }] },
      { el: R, k: [{ r: upR * 0.25 }, { r: outR * 0.4 }, { r: upR * 0.9 }, { r: outR * 0.4 }, { r: upR * 0.25 }] },
      { el: "legL", k: [{ r: 0 }, { r: 0 }, { r: 14, y: -2 }, { r: 0 }, { r: 0 }] },
      { el: "legR", k: [{ r: -14, y: -2 }, { r: 0 }, { r: 0 }, { r: 0 }, { r: -14, y: -2 }] }, kbOff, ...extras(12, 2) ] };
    case "worry": return { d: 520, loop: true, tracks: [
      { el: "root", k: [{ x: -0.5 }, { x: 0.5 }, { x: -0.5 }] },
      { el: "upper", k: [{ y: 0.8, sy: 0.98 }, { y: 0.8, sy: 0.98 }] },
      { el: "head", k: [{ r: -2, y: 1 }, { r: 2, y: 1 }, { r: -2, y: 1 }] },
      { el: L, k: [{ r: tL * 0.55 }, { r: tL * 0.5 }, { r: tL * 0.55 }] }, { el: R, k: [{ r: tR * 0.55 }, { r: tR * 0.5 }, { r: tR * 0.55 }] },
      kbOff, ...extras(3, 2) ] };
    case "lose": return { d: 1700, tracks: [ // one-shot dramatic defeat: shock, knees buckle, head drops, arms flop
      { el: "root", k: [S(1), { ...S(1.05, -2), t: 0.12 }, { ...S(0.8, 6), t: 0.38, e: "cubic-bezier(.5,0,.8,.5)" }, { ...S(0.86, 4.5), t: 0.52 }, { ...S(0.83, 5.2), t: 0.7 }, { ...S(0.84, 5), t: 1 }] },
      { el: "upper", k: [{ r: 0 }, { r: 2, y: -1, t: 0.12 }, { r: -7, y: 4, t: 0.38 }, { r: -4, y: 3, t: 0.52 }, { r: -6, y: 3.5, t: 0.7 }, { r: -5, y: 3.5, t: 1 }] },
      { el: "head", k: [{ r: 0 }, { r: -6, y: -1.5, t: 0.12 }, { r: 26, y: 6, t: 0.42, e: "ease-in" }, { r: 16, y: 4.5, t: 0.56 }, { r: 22, y: 5.5, t: 0.72 }, { r: 20, y: 5.2, t: 1 }] },
      { el: L, k: [{ r: 0 }, { r: upL * 0.75, t: 0.12 }, { r: outL * 0.5, t: 0.38 }, { r: -10, t: 0.52 }, { r: 6, t: 0.66 }, { r: -3, t: 0.82 }, { r: 2, t: 1 }] },
      { el: R, k: [{ r: 0 }, { r: upR * 0.75, t: 0.12 }, { r: outR * 0.5, t: 0.38 }, { r: 10, t: 0.52 }, { r: -6, t: 0.66 }, { r: 3, t: 0.82 }, { r: -2, t: 1 }] },
      { el: "legL", k: [{ r: 0 }, { r: 0, t: 0.12 }, { r: -12, t: 0.38 }, { r: -9, t: 0.52 }, { r: -11, t: 1 }] },
      { el: "legR", k: [{ r: 0 }, { r: 0, t: 0.12 }, { r: 12, t: 0.38 }, { r: 9, t: 0.52 }, { r: 11, t: 1 }] },
      { el: "shadow", k: [{ sx: 1 }, { sx: 0.9, t: 0.12 }, { sx: 1.12, t: 0.38 }, { sx: 1.1, t: 1 }] },
      kbOff, ...ex("bob", [{ r: 0 }, { r: -8, t: 0.12 }, { r: 22, t: 0.42 }, { r: 18, t: 1 }]), ...ex("flap", [{ r: 0 }, { r: -20, t: 0.12 }, { r: 24, t: 0.45 }, { r: 20, t: 1 }]),
      ...ex("wag", [{ r: 0 }, { r: 10, t: 0.12 }, { r: -18, t: 0.45 }, { r: -16, t: 1 }]) ] };
    case "sad": return { d: 3400, loop: true, tracks: [ // slumped looping idle: head hung, slow sway, wipes an eye
      { el: "root", k: [{ ...S(0.84, 5), r: 0 }, { ...S(0.85, 4.8), r: -1.2, t: 0.25 }, { ...S(0.84, 5), r: 0, t: 0.5 }, { ...S(0.85, 4.8), r: 1.2, t: 0.75 }, { ...S(0.84, 5), r: 0, t: 1 }] },
      { el: "upper", k: [{ r: -5, y: 3.5 }, { r: -3, y: 3.2, t: 0.5 }, { r: -5, y: 3.5, t: 1 }] },
      { el: "head", k: [{ r: 20, y: 5.2 }, { r: 16, y: 4.6, t: 0.25 }, { r: 12, y: 4, t: 0.5 }, { r: 12, y: 4, t: 0.72 }, { r: 20, y: 5.2, t: 1 }] },
      { el: L, k: [{ r: 2 }, { r: -3, t: 0.25 }, { r: 2, t: 0.5 }, { r: -3, t: 0.75 }, { r: 2, t: 1 }] },
      { el: R, k: [{ r: -2, z: 40 }, { r: -2, z: 40, t: 0.4 }, { r: wipe * 0.85, z: 60, t: 0.52 }, { r: wipe, z: 60, t: 0.58 }, { r: wipe * 0.9, z: 60, t: 0.64 }, { r: wipe, z: 60, t: 0.7 }, { r: -2, z: 40, t: 0.84 }, { r: -2, z: 40, t: 1 }] },
      { el: "legL", k: [{ r: -11 }, { r: -11 }] }, { el: "legR", k: [{ r: 11 }, { r: 11 }] },
      { el: "shadow", k: [{ sx: 1.1 }, { sx: 1.1 }] }, kbOff,
      ...ex("bob", [{ r: 18 }, { r: 22, t: 0.5 }, { r: 18, t: 1 }]), ...ex("flap", [{ r: 20 }, { r: 16, t: 0.5 }, { r: 20, t: 1 }]), ...ex("wag", [{ r: -16 }, { r: -12, t: 0.5 }, { r: -16, t: 1 }]) ] };
  }
}

function frames(k: K[]) {
  return k.map((f, i) => {
    const o: Keyframe = { transform: tf(f) };
    if (f.o !== undefined) o.opacity = f.o;
    if (f.z !== undefined) o.zIndex = String(f.z);
    if (f.e) o.easing = f.e;
    o.offset = f.t ?? (k.length > 1 ? i / (k.length - 1) : 0);
    return o;
  });
}

const css = (s: Partial<CSSStyleDeclaration> & Record<string, string>) => s;
const LIVE = new Set<Puppet>();
// Read-only test/QA hook (e2e): list live puppets, freeze a pose, or build an off-screen rig to prove it loads.
if (typeof window !== "undefined") (window as unknown as { __pp: unknown }).__pp = {
  live: () => [...LIVE].map((p) => ({ key: p.key, move: p.move, base: p.base })),
  pose: (i: number, m: Base | Move, ms: number) => [...LIVE][i]?.pose(m, ms),
  release: (i: number) => [...LIVE][i]?.release(),
  probe: async (key: string) => {
    const img = new Image(); img.src = `/c/rig/${key}.atlas.v1.webp`; await img.decode();
    const host = document.createElement("div"); host.style.cssText = "position:fixed;left:-999px;top:0;width:200px;height:200px";
    document.body.append(host); const p = new Puppet(host, key); const n = p.el.querySelectorAll(".pp-s").length; p.destroy(); host.remove();
    return { key, parts: n, w: img.naturalWidth };
  },
  read: (i: number) => { const p = [...LIVE][i]; if (!p) return null; const q = (n: string) => p.el.querySelector<HTMLElement>(`.pp-${n}`);
    const m = (n: string) => { const e = q(n); if (!e) return null; const t = new DOMMatrix(getComputedStyle(e).transform); return { a: +(Math.atan2(t.b, t.a) * 180 / Math.PI).toFixed(1), x: +t.e.toFixed(1), y: +t.f.toFixed(1), sy: +Math.hypot(t.c, t.d).toFixed(3), z: getComputedStyle(e).zIndex, o: getComputedStyle(e).opacity }; };
    return { move: p.move, root: m("root"), upper: m("upper"), head: m("head"), armL: m("armL"), armR: m("armR"), legL: m("legL"), legR: m("legR"), kb: m("kb") }; },
};
export class Puppet {
  el: HTMLDivElement; private nodes: Record<string, HTMLElement> = {}; private g: Geo;
  private baseAnims: Animation[] = []; private oneAnims: Animation[] = []; private oneTimer = 0;
  base: Base = "idle"; move: string = "idle"; dir = 1; reduced = reduced(); frozen = false;
  constructor(host: HTMLElement, public key: string, opts: { dir?: number; plate?: boolean } = {}) {
    const r = RIGS[key]; this.g = new Geo(r); this.dir = opts.dir ?? 1;
    const el = (this.el = document.createElement("div")); el.className = "pp"; el.dataset.rig = key;
    const [l, t, w, h] = r.box;
    const canvas = document.createElement("div"); canvas.className = "pp-c";
    Object.assign(canvas.style, css({ left: `${l * 100}%`, top: `${t * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }));
    const url = `/c/rig/${key}.atlas.v1.webp`;
    const mk = (name: string, origin: [number, number], z = 0) => {
      const d = document.createElement("div"); d.className = `pp-p pp-${name}`; d.style.transformOrigin = `${origin[0]}% ${origin[1]}%`; d.style.zIndex = String(z);
      this.nodes[name] = d; return d;
    };
    const shadow = document.createElement("div"); shadow.className = "pp-shadow";
    shadow.style.left = `${this.g.foot[0] - 30}%`; shadow.style.top = `${this.g.foot[1] - 2.5}%`; this.nodes.shadow = shadow;
    canvas.append(shadow);
    const root = mk("root", this.g.foot, 1); const upper = mk("upper", this.g.hip, 10);
    root.append(upper); canvas.append(root);
    for (const p of r.parts) {
      const d = mk(p.n, p.pivot, p.z);
      const s = document.createElement("div"); s.className = "pp-s";
      const [AW, AH] = r.atlas;
      Object.assign(s.style, css({ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%`, backgroundImage: `url(${url})`,
        backgroundSize: `${(AW / p.aw) * 100}% ${(AH / p.ah) * 100}%`,
        backgroundPosition: `${AW === p.aw ? 0 : (p.ax / (AW - p.aw)) * 100}% ${AH === p.ah ? 0 : (p.ay / (AH - p.ah)) * 100}%` }));
      d.append(s); d.dataset.kind = p.kind;
    }
    for (const p of r.parts) (p.n === "torso" ? upper : this.nodes[p.parent] ?? upper).append(this.nodes[p.n]);
    // plush keyboard prop, in front of the belly and under the hands
    const [kx, ky, kw] = this.g.kb; const kb = mk("kb", [50, 50], 35); kb.classList.remove("pp-p"); kb.classList.add("pp-kb");
    Object.assign(kb.style, css({ left: `${kx - kw / 2}%`, top: `${ky - 3.2}%`, width: `${kw}%`, height: `${6.4}%`, opacity: "0" }));
    kb.innerHTML = "<i></i><i></i><i></i>";
    upper.append(kb);
    el.append(canvas); host.append(el); LIVE.add(this);
    this.setBase("idle");
  }
  private run(name: Base | Move, extra?: { add?: boolean }): Animation[] {
    const sp = spec(this.g, name, this.dir);
    if (this.reduced) return [];
    return sp.tracks.flatMap((tr) => {
      const node = this.nodes[tr.el]; if (!node || !tr.k.length) return [];
      const kf = frames(tr.k.length === 1 ? [tr.k[0], tr.k[0]] : tr.k);
      return [node.animate(kf, { duration: sp.d, iterations: sp.loop ? Infinity : 1, easing: "ease-in-out", fill: sp.loop ? "none" : "forwards", composite: tr.add || extra?.add ? "add" : "replace" })];
    });
  }
  setBase(b: Base, force = false) {
    if (this.frozen) { this.base = b; return; }
    if (b === this.base && this.baseAnims.length && !force) return;
    this.base = b;
    if (this.oneTimer) return; // a one-shot is playing; it hands back to the new base when done
    this.baseAnims.forEach((a) => a.cancel()); this.baseAnims = this.run(b); this.move = b; this.el.dataset.move = b;
  }
  /** One-shot moves. nod/step layer on top of the base (additive); the rest take over the whole body, then return to base. */
  play(m: Move) {
    if (this.frozen) return;
    if (m === "nod" || m === "step") { const a = this.run(m); this.el.dataset.last = m; a.forEach((x) => x.finished.then(() => x.cancel(), () => {})); return; }
    clearTimeout(this.oneTimer); this.oneAnims.forEach((a) => a.cancel());
    this.baseAnims.forEach((a) => a.cancel()); this.baseAnims = [];
    this.oneAnims = this.run(m); this.move = m; this.el.dataset.move = m; this.el.dataset.last = m;
    const d = spec(this.g, m, this.dir).d;
    this.oneTimer = window.setTimeout(() => {
      this.oneTimer = 0; if (m === "lose") this.base = "sad";
      this.baseAnims = this.run(this.base); this.oneAnims.forEach((a) => a.cancel()); this.oneAnims = [];
      this.move = this.base; this.el.dataset.move = this.base;
    }, this.reduced ? 0 : d);
  }
  /** Freeze at a time (ms) into a move, for deterministic frame capture (web-ocean's shot mode idea). */
  pose(m: Base | Move, ms: number) {
    clearTimeout(this.oneTimer); this.oneTimer = 0; this.frozen = true;
    [...this.baseAnims, ...this.oneAnims].forEach((a) => a.cancel()); this.oneAnims = [];
    this.baseAnims = this.reduced ? [] : this.run(m); this.baseAnims.forEach((a) => { a.pause(); a.currentTime = ms; });
    this.move = m; this.el.dataset.move = m;
  }
  release() { this.frozen = false; this.setBase(this.base, true); }
  duration(m: Base | Move) { return spec(this.g, m, this.dir).d; }
  destroy() { LIVE.delete(this); clearTimeout(this.oneTimer); [...this.baseAnims, ...this.oneAnims].forEach((a) => a.cancel()); this.el.remove(); }
}
