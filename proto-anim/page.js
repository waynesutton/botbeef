import { makePuppet } from "./rig.js";
const $ = (s) => document.querySelector(s);
const big = await makePuppet($("#big")), m88 = await makePuppet($("#m88")), m64 = await makePuppet($("#m64")), m64r = await makePuppet($("#m64r"));
m64r.flip = true;
const all = [big, m88, m64, m64r];
const now = () => { $("#now").textContent = `move: ${big.move ?? big.base}`; requestAnimationFrame(now); }; now();
for (const b of ["idle", "type", "dance"]) { const x = document.createElement("button"); x.textContent = b; x.onclick = () => all.forEach((p) => p.setBase(b)); $("#bases").append(x); }
for (const m of ["cheer", "jump", "kick", "lose", "nod"]) { const x = document.createElement("button"); x.textContent = m; x.dataset.move = m; x.onclick = () => all.forEach((p) => p.play(m)); $("#moves").append(x); }
// tap to expand (2D): a big copy of the same puppet; tap cycles moves
let xp = null, xi = 0; const XM = ["cheer", "jump", "kick", "dance", "lose"];
$("#big").onclick = async () => { $("#expand").hidden = false; if (!xp) xp = await makePuppet($("#xs")); xp.move = null; xp.setBase("idle"); xp.play("cheer"); };
$("#xs").onclick = () => { const m = XM[xi++ % XM.length]; m === "dance" ? (xp.setBase("dance"), setTimeout(() => xp.setBase("idle"), 2200)) : xp.play(m); };
$("#close").onclick = () => { $("#expand").hidden = true; };
addEventListener("keydown", (e) => { if (e.key === "Escape") $("#expand").hidden = true; });
// simulated round, same mapping we'd wire to useReactions/useSwings/useMoods
$("#sim").onclick = async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  all.forEach((p) => { p.move = null; p.setBase("type"); });
  for (let w = 1; w <= 12; w++) {
    await wait(520);
    if (w === 5) all.forEach((p) => p.play("jump"));            // keyword hit
    else if (w === 9) all.forEach((p) => p.play("kick"));       // big Jev swing in our favour (lunge at the rival)
    else if (w % 4 === 0) all.forEach((p) => p.play("nod"));
    else all.forEach((p) => !p.move && p.play("nod"));
  }
  await wait(900); all.forEach((p) => p.setBase("dance"));      // smug lead
  await wait(2200); big.play("cheer"); m88.play("cheer"); m64.play("lose"); m64r.play("lose");
};
window.__puppets = { big, m88, m64, m64r };
