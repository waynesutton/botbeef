// Plush puppet prototype: layered cutout parts + WAAPI keyframes (no canvas, no WebGL, no library).
// Joints: root (whole body; squash pivots at the feet), upper (torso+arms+head; pivots at the hips), head (neck),
// armL/armR (shoulders), legL/legR (hips). Keyframes are tiny {r: deg, x: %, y: %, sx, sy} objects.
const ORDER = ["legL", "legR", "armL", "armR", "torso", "head"];

export async function makePuppet(stage, base = "parts/") {
  const rig = await (await fetch(base + "rig.json")).json();
  stage.style.setProperty("--bg", rig.bg);
  const puppet = el("div", "puppet"), root = el("div", "root"), upper = el("div", "upper"), shadow = el("div", "shadow");
  const j = { root, upper };
  for (const n of ORDER) {
    const p = rig.parts[n], d = el("div", `p ${n}`), img = new Image();
    img.src = `${base}${n}.v1.webp`; img.alt = ""; img.draggable = false; img.decoding = "async";
    Object.assign(img.style, { left: p.x + "%", top: p.y + "%", width: p.w + "%", height: p.h + "%" });
    d.style.transformOrigin = `${p.ox}% ${p.oy}%`; d.append(img); j[n] = d;
    (n.startsWith("leg") ? root : upper).append(d);
  }
  upper.style.transformOrigin = `${rig.parts.torso.ox}% ${rig.parts.torso.oy}%`;
  root.style.transformOrigin = "50% 90%";
  root.append(upper); puppet.append(root); stage.append(shadow, puppet);
  await Promise.all([...stage.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
  return new Puppet(stage, puppet, j, shadow);
}
const el = (t, c) => Object.assign(document.createElement(t), { className: c });
const tf = (k) => `translate(${k.x ?? 0}%, ${k.y ?? 0}%) rotate(${k.r ?? 0}deg) scale(${k.sx ?? 1}, ${k.sy ?? 1})`;

// Each move: duration ms, loop?, per-joint keyframe lists (evenly spaced unless `o` offsets given), easing.
const S = (sy, y = 0) => ({ sy, sx: 2 - sy, y });   // squash/stretch keeping volume
export const MOVES = {
  idle: { d: 2600, loop: true, ease: "ease-in-out", j: {
    upper: [{}, { sy: 1.025, sx: .99 }, {}], head: [{ r: 0 }, { r: -3, y: -.4 }, { r: 0 }, { r: 3, y: -.4 }, { r: 0 }],
    armL: [{ r: 2 }, { r: 7 }, { r: 2 }], armR: [{ r: -2 }, { r: -7 }, { r: -2 }] } },
  type: { d: 560, loop: true, ease: "ease-in-out", j: {
    armL: [{ r: 18 }, { r: 34 }, { r: 18 }], armR: [{ r: -34 }, { r: -18 }, { r: -34 }],
    head: [{ r: 0 }, { r: 2, y: .6 }, { r: 0 }], upper: [{}, { sy: .985 }, {}] } },
  cheer: { d: 1400, ease: "cubic-bezier(.3,1.4,.5,1)", j: {
    armL: [{ r: 0 }, { r: 128 }, { r: 104 }, { r: 132 }, { r: 108 }, { r: 0 }], armR: [{ r: 0 }, { r: -128 }, { r: -104 }, { r: -132 }, { r: -108 }, { r: 0 }],
    root: [S(1), S(1.05, -5), S(.95), S(1.05, -5), S(.96), S(1)], head: [{}, { r: -5, y: -1 }, { r: 4 }, { r: -5, y: -1 }, { r: 3 }, {}] } },
  jump: { d: 1050, ease: "ease-in-out", o: [0, .2, .45, .7, .84, 1], j: {
    root: [S(1), S(.82), S(1.1, -17), S(.84), S(1.04), S(1)], shadow: [{}, { sx: 1.1 }, { sx: .6, o: .5 }, { sx: 1.15 }, {}, {}],
    legL: [{}, { r: 4 }, { r: -18 }, { r: 3 }, {}, {}], legR: [{}, { r: -4 }, { r: 18 }, { r: -3 }, {}, {}],
    armL: [{}, { r: -12 }, { r: 125 }, { r: 30 }, { r: 8 }, {}], armR: [{}, { r: 12 }, { r: -125 }, { r: -30 }, { r: -8 }, {}],
    head: [{}, { y: 1.5 }, { y: -2, r: -4 }, { y: 2.5 }, { y: -.5 }, {}] } },
  kick: { d: 950, ease: "ease-in-out", o: [0, .25, .45, .7, 1], j: {
    root: [{}, { x: -4, sy: .97 }, { x: -6, r: -4 }, { x: -3 }, {}], upper: [{}, { r: -6 }, { r: -12 }, { r: -6 }, {}],
    legR: [{}, { r: 8 }, { r: -78 }, { r: -50 }, {}], legL: [{}, { r: 3 }, { r: 6 }, { r: 3 }, {}],
    armL: [{}, { r: 35 }, { r: 75 }, { r: 40 }, {}], armR: [{}, { r: -10 }, { r: -40 }, { r: -20 }, {}],
    head: [{}, { r: 5 }, { r: 10 }, { r: 4 }, {}] } },
  dance: { d: 1100, loop: true, ease: "ease-in-out", j: {
    root: [{ ...S(1) }, { ...S(.95), x: 4 }, { ...S(1) }, { ...S(.95), x: -4 }, { ...S(1) }],
    upper: [{ r: 0 }, { r: 8 }, { r: 0 }, { r: -8 }, { r: 0 }],
    armL: [{ r: 30 }, { r: 125 }, { r: 30 }, { r: 70 }, { r: 30 }], armR: [{ r: -70 }, { r: -30 }, { r: -125 }, { r: -30 }, { r: -70 }],
    legL: [{}, { r: -14, y: -2 }, {}, {}, {}], legR: [{}, {}, {}, { r: 14, y: -2 }, {}],
    head: [{ r: 0 }, { r: -10 }, { r: 0 }, { r: 10 }, { r: 0 }] } },
  lose: { d: 1500, hold: true, ease: "cubic-bezier(.4,0,.2,1)", o: [0, .35, 1], j: {
    root: [S(1), S(1.03), S(.92, 2)], upper: [{}, { r: 2 }, { r: -9, y: 4 }],
    head: [{}, { r: -6, y: -1 }, { r: 22, y: 8 }], armL: [{ r: 2 }, { r: 20 }, { r: -10 }], armR: [{ r: -2 }, { r: -20 }, { r: 10 }],
    legL: [{}, {}, { r: 4 }], legR: [{}, {}, { r: -4 }] } },
  sad: { d: 2800, loop: true, ease: "ease-in-out", j: {   // after lose: slumped breathing
    root: [S(.92, 2), S(.935, 2), S(.92, 2)], upper: [{ r: -9, y: 4 }, { r: -8, y: 3.6 }, { r: -9, y: 4 }], head: [{ r: 22, y: 8 }, { r: 20, y: 7.4 }, { r: 22, y: 8 }],
    armL: [{ r: -10 }, { r: -8 }, { r: -10 }], armR: [{ r: 10 }, { r: 8 }, { r: 10 }], legL: [{ r: 4 }, { r: 4 }], legR: [{ r: -4 }, { r: -4 }] } },
  nod: { d: 320, ease: "ease-out", j: { head: [{}, { r: 3, y: 1.2 }, {}], root: [S(1), S(.96), S(1)] } },
};

class Puppet {
  constructor(stage, puppet, j, shadow) { Object.assign(this, { stage, puppet, j: { ...j, shadow }, anims: [], base: "idle", move: null }); this.setBase("idle"); }
  run(name, onDone) {
    const m = MOVES[name]; this.anims.forEach((a) => a.cancel()); this.anims = [];
    for (const [k, frames] of Object.entries(m.j)) {
      const kf = frames.map((f, i) => ({ transform: tf(f), opacity: f.o ?? 1, ...(m.o ? { offset: m.o[i] } : {}) }));
      if (k === "shadow") kf.forEach((f, i) => { f.transform = `scale(${frames[i].sx ?? 1}, 1)`; });
      const a = this.j[k].animate(kf, { duration: m.d, iterations: m.loop ? Infinity : 1, easing: m.ease, fill: m.hold ? "forwards" : "none" });
      this.anims.push(a);
    }
    if (!m.loop && this.anims[0]) this.anims[0].onfinish = () => onDone?.();
    this.stage.dataset.move = name;
  }
  /** Loops in the background (idle, type, dance, sad); one-shots return to it. */
  setBase(name) { this.base = name; if (!this.move) this.run(name); this.stage.classList.toggle("lose", name === "sad"); }
  play(name) {
    if (name === "lose") { this.move = "lose"; this.stage.classList.add("lose"); this.run("lose", () => { this.move = null; this.setBase("sad"); }); return; }
    this.move = name; this.run(name, () => { this.move = null; this.run(this.base); });
  }
  set flip(v) { this.puppet.classList.toggle("flip", v); }
}
