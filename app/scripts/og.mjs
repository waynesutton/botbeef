// Pre-composite the per-matchup share images (1200x630) with headless Chromium.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
const C = { grokbot: ["Grokbot", "#7c6cf2"], musey: ["Musey", "#3b82f6"], dotty: ["Dotty", "#10b981"], sparkle: ["Sparkle", "#ec4899"], deepy: ["Deepy", "#0ea5e9"], clawd: ["Clawd", "#d97706"], kimmy: ["Kimmy", "#6366f1"], house: ["The House", "#15803d"], hermy: ["Hermy", "#b8902e"], hunch: ["Hunch", "#3f3f46"], zozo: ["Zozo", "#8b93a1"], townsy: ["Townsy", "#2563eb"], pinchy: ["Pinchy", "#e5322d"], human: ["Human", "#f59e0b"] };
const img = (id) => `data:image/webp;base64,${readFileSync(`public/c/${id}.v1.webp`).toString("base64")}`;
const css = `*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff7ef;overflow:hidden;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(circle at 15% 20%,rgba(255,90,54,.35),transparent 45%),radial-gradient(circle at 85% 80%,rgba(124,58,237,.35),transparent 45%)}
.top{position:absolute;top:36px;left:0;right:0;text-align:center;font-weight:900;font-size:44px;letter-spacing:-.02em;color:#1f1633}
.top span{background:linear-gradient(90deg,#ff5a36,#7c3aed);-webkit-background-clip:text;color:transparent}
.f{position:absolute;top:130px;width:400px;text-align:center}.f img{width:340px;height:340px;border-radius:30%;box-shadow:0 0 0 10px var(--c),0 20px 40px rgba(0,0,0,.2)}
.f b{display:block;margin-top:28px;font-size:48px;font-weight:900;color:#1f1633}.l{left:70px}.r{right:70px}
.vs{position:absolute;left:50%;top:270px;transform:translateX(-50%) rotate(-8deg);background:#1f1633;color:#fff;font-weight:900;font-size:72px;padding:10px 28px;border-radius:24px}
.tag{position:absolute;bottom:26px;left:0;right:0;text-align:center;font-size:24px;color:#6b6280;font-weight:700}`;
const pair = (a, b) => `<style>${css}</style><div class="bg"></div><div class="top"><span>Bot Battle</span> · who's got bars?</div>
<div class="f l" style="--c:${C[a][1]}"><img src="${img(a)}"><b>${C[a][0]}</b></div><div class="vs">VS</div>
<div class="f r" style="--c:${C[b][1]}"><img src="${img(b)}"><b>${C[b][0]}</b></div><div class="tag">15, 30 or 45-second AI battles · judged live by Jev · watch the battle</div>`;
const home = `<style>${css}.row{position:absolute;top:150px;left:0;right:0;display:flex;justify-content:center;gap:26px}.row img{width:190px;height:190px;border-radius:30%;box-shadow:0 0 0 7px var(--c),0 14px 30px rgba(0,0,0,.18)}
h1{position:absolute;top:390px;left:0;right:0;text-align:center;margin:0;font-size:96px;font-weight:900;letter-spacing:-.04em;background:linear-gradient(90deg,#ff5a36,#7c3aed);-webkit-background-clip:text;color:transparent}</style>
<div class="bg"></div><div class="top">Bot Battle</div><div class="row">${["grokbot", "musey", "dotty", "sparkle", "hermy"].map((k) => `<img style="--c:${C[k][1]}" src="${img(k)}">`).join("")}</div><h1>Who's got bars?</h1><div class="tag">45-second AI battles · coach a bot or beat one yourself · anyone can watch</div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
const shot = async (html, out) => { await p.setContent(html); await p.waitForTimeout(30); await p.screenshot({ path: out, type: "jpeg", quality: 82 }); };

const bots = Object.keys(C).filter((k) => k !== "human");
let n = 1;
for (const a of [...bots, "human"]) for (const x of bots) if (a !== x) { await shot(pair(a, x), `public/og/${a}-vs-${x}.v3.jpg`); n++; }
await b.close();
console.log("images", n);
