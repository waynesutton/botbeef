// Site-level share images (1200x630): home and leaderboard. Per-matchup images come from og.mjs.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
const C = { grokbot: "#7c6cf2", musey: "#3b82f6", dotty: "#10b981", sparkle: "#ec4899", deepy: "#0ea5e9", clawd: "#d97706", kimmy: "#6366f1", hermy: "#b8902e", hunch: "#3f3f46", zozo: "#8b93a1", townsy: "#2563eb", pinchy: "#e5322d", house: "#15803d", jev: "#d99a12" };
// Monochrome mark (white on the gradient, no tile behind it), same paths as src/icons.tsx Logo.
const icons = readFileSync("src/icons.tsx", "utf8");
const LB = icons.match(/LOGO_BODY = "([^"]+)"/)[1], LH = icons.match(/LOGO_HEAD = "([^"]+)"/)[1];
const mark = `<svg class="mk" viewBox="0 0 32 32" fill="#fff"><path fill-rule="evenodd" d="${LB}"/><g transform="rotate(8 16 9)"><rect x="11.8" y="7.3" width="15.3" height="3.4" rx="1.7"/><path fill-rule="evenodd" d="${LH}"/></g></svg>`;
const img = (id) => `data:image/webp;base64,${readFileSync(`public/c/${id}.v1.webp`).toString("base64")}`;
const css = `*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden;position:relative;color:#fff;
background:linear-gradient(135deg,#ff5a36 0%,#c2338f 48%,#6d28d9 100%)}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.14) 2px,transparent 2px);background-size:26px 26px}
.av{border-radius:30%;box-shadow:0 0 0 8px #fff,0 0 0 14px var(--c),0 24px 40px rgba(0,0,0,.3);object-fit:cover}
.mk{position:absolute;left:58px;top:50px;width:100px;height:100px;filter:drop-shadow(0 6px 0 rgba(0,0,0,.18))}
.wm{position:absolute;left:176px;top:48px;font-size:104px;font-weight:900;letter-spacing:-.045em;line-height:.9;text-shadow:0 6px 0 rgba(0,0,0,.18)}
.sub{position:absolute;left:64px;top:262px;width:560px;font-size:30px;font-weight:800;line-height:1.2}
.chips{position:absolute;left:64px;top:408px;display:flex;gap:10px;flex-wrap:wrap;width:540px}
.chip{background:rgba(255,255,255,.95);color:#1f1633;font-weight:900;font-size:22px;padding:8px 16px;border-radius:999px;box-shadow:0 4px 0 rgba(0,0,0,.18)}
.url{position:absolute;left:64px;bottom:40px;font-size:24px;font-weight:800;opacity:.92}
.fight{position:absolute;right:56px;top:70px;width:520px;height:420px}
.fight .a{position:absolute;left:0;top:40px;width:220px;height:220px;transform:rotate(-6deg)}
.fight .b{position:absolute;right:0;top:40px;width:220px;height:220px;transform:rotate(6deg) scaleX(-1)}
.vs{position:absolute;z-index:4;left:50%;top:210px;transform:translateX(-50%) rotate(-10deg);background:#1f1633;color:#fff200;font-weight:900;font-size:64px;padding:6px 22px;border-radius:20px;box-shadow:0 6px 0 rgba(0,0,0,.3)}
.pop{position:absolute;z-index:5;right:-14px;top:-6px;background:#fff200;color:#1f1633;font-weight:900;font-size:36px;padding:4px 16px;border-radius:999px;transform:rotate(8deg);box-shadow:0 5px 0 rgba(0,0,0,.2)}
.bar{position:absolute;left:10px;right:10px;top:318px;height:34px;border-radius:999px;border:4px solid #fff;overflow:hidden;display:flex;background:#fff}
.bar i{display:block;height:100%}
.n{position:absolute;top:362px;font-size:44px;font-weight:900}
.roster{position:absolute;right:52px;bottom:38px;display:flex;gap:10px}.roster img{width:48px;height:48px}`;
const row = (ids) => `<div class="roster">${ids.map((k) => `<img class="av" style="--c:${C[k]};box-shadow:0 0 0 4px #fff" src="${img(k)}">`).join("")}</div>`;
const fight = (a, b, sa, sb, pop) => `<div class="fight"><div class="pop">${pop}</div><img class="av a" style="--c:${C[a]}" src="${img(a)}"><div class="vs">VS</div><img class="av b" style="--c:${C[b]}" src="${img(b)}">
<div class="bar"><i style="width:${(sa / (sa + sb)) * 100}%;background:${C[a]}"></i><i style="flex:1;background:${C[b]}"></i></div><b class="n" style="left:14px">${sa}</b><b class="n" style="right:14px">${sb}</b></div>`;
const home = `<style>${css}</style><div class="dots"></div>${mark}<div class="wm">Bot<br>Battle</div>
<div class="sub">Bots on the mic, head to head. A better, funnier AI benchmark, judged by Jev in real time.</div>
<div class="chips"><span class="chip">Coach a bot</span><span class="chip">Beat one yourself</span><span class="chip">Duel a friend</span><span class="chip">Crowd watches live</span></div>
<div class="url">small-mallard-255.convex.site</div>${fight("grokbot", "musey", 82, 71, "ROUND 1")}${row(["dotty", "sparkle", "deepy", "clawd", "kimmy", "hermy", "hunch", "zozo", "townsy", "pinchy", "house"])}`;
const lb = `<style>${css}.rows{position:absolute;right:60px;top:70px;width:520px;display:grid;gap:14px}
.r{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.95);color:#1f1633;border-radius:24px;padding:10px 18px;box-shadow:0 5px 0 rgba(0,0,0,.18);font-size:30px;font-weight:900}
.r img{width:64px;height:64px}.lbchips{top:430px}.r em{margin-left:auto;font-style:normal;color:#c2338f}</style><div class="dots"></div>${mark}<div class="wm">Bot<br>Battle</div>
<div class="sub">Leaderboard: who's winning the battle? Battle Points and AI win rates.</div>
<div class="chips lbchips"><span class="chip">This week</span><span class="chip">All time</span><span class="chip">Which AI wins?</span></div>
<div class="url">small-mallard-255.convex.site/leaderboard</div>
<div class="rows">${[["grokbot", "1"], ["musey", "2"], ["hermy", "3"], ["house", "4"], ["clawd", "5"]].map(([k, n]) => `<div class="r"><img class="av" style="--c:${C[k]};box-shadow:0 0 0 4px ${C[k]}" src="${img(k)}">${k === "house" ? "The House" : k[0].toUpperCase() + k.slice(1)}<em>#${n}</em></div>`).join("")}</div>`;
const bots = `<style>${css}.judge{position:absolute;right:170px;top:40px;width:250px;height:250px}.judge img{width:250px;height:250px}
.jk{position:absolute;z-index:3;left:50%;bottom:-18px;transform:translateX(-50%) rotate(-4deg);background:#1f1633;color:#fff200;font-weight:900;font-size:30px;letter-spacing:.08em;padding:6px 18px;border-radius:16px;white-space:nowrap;box-shadow:0 5px 0 rgba(0,0,0,.3)}
.grid{position:absolute;right:56px;top:352px;width:500px;display:flex;flex-wrap:wrap;justify-content:center;gap:16px 14px}.grid img{width:58px;height:58px}</style><div class="dots"></div>${mark}<div class="wm">Bot<br>Battle</div>
<div class="sub">Meet the bots: 13 plush contenders and one very fair judge.</div>
<div class="chips"><span class="chip">Trading cards</span><span class="chip">Swap-in models</span><span class="chip">Jev judges live</span></div>
<div class="url">small-mallard-255.convex.site/bots</div>
<div class="judge"><img class="av" style="--c:${C.jev}" src="${img("jev")}"><div class="jk">THE JUDGE</div></div>
<div class="grid">${["grokbot", "musey", "dotty", "sparkle", "deepy", "clawd", "kimmy", "hermy", "hunch", "zozo", "townsy", "pinchy", "house"].map((k) => `<img class="av" style="--c:${C[k]};box-shadow:0 0 0 4px #fff,0 0 0 8px ${C[k]}" src="${img(k)}">`).join("")}</div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
const only = process.argv.slice(2);
for (const [html, out] of [[home, "public/og/home.v8.jpg"], [lb, "public/og/leaderboard.v6.jpg"], [bots, "public/og/bots.v1.jpg"]].filter(([, o]) => !only.length || only.some((k) => o.includes(k)))) { await p.setContent(html); await p.waitForTimeout(50); await p.screenshot({ path: out, type: "jpeg", quality: 86 }); }
await b.close();
