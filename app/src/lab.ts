import { Puppet, RIG_KEYS, type Base, type Move } from "./puppet";
import { CHARACTERS } from "../convex/config";
const q = new URLSearchParams(location.search);
const keys = (q.get("k") ?? RIG_KEYS.join(",")).split(",");
const g = document.getElementById("g")!; g.style.setProperty("--s", (q.get("s") ?? "180") + "px"); g.style.setProperty("--n", q.get("n") ?? "7");
const ps: Puppet[] = [];
for (const k of keys) {
  const c = document.createElement("div"); c.className = "cell"; c.style.setProperty("--ring", CHARACTERS.find((c) => (c.art ?? c.id) === k)?.color ?? "#888");
  const bg = document.createElement("div"); bg.className = "pp-bg"; bg.style.backgroundImage = `url(/c/rig/${k}.plate.v1.webp)`; c.append(bg);
  const p = new Puppet(c, k, { dir: q.get("dir") === "-1" ? -1 : 1 }); ps.push(p);
  if (q.get("label") !== "0") { const b = document.createElement("b"); b.textContent = k; c.append(b); }
  g.append(c);
}
Object.assign(window, { __ps: ps, pose: (m: Base | Move, ms: number) => ps.forEach((p) => p.pose(m, ms)), dur: (m: Base | Move) => ps[0].duration(m) });
const m = q.get("m"); if (m) ps.forEach((p) => p.pose(m as Base, Number(q.get("t") ?? 0)));
