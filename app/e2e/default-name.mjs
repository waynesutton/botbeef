// E2E: play without typing a name. An empty name field plays as this browser's own default name ("Player 4821"),
// made from random digits in the browser and kept in localStorage (bb.dname). No server counter is involved.
// Covers solo, You vs Agent, Exhibition and Duel (host + invite guest), reload persistence, typed override, leaderboard.
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const OUT = "/workspace/agent-battle/share/default-name";
await import("node:fs").then((fs) => fs.mkdirSync(OUT, { recursive: true }));
const results = []; const errors = [];
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond }); console.log(cond ? "PASS" : "FAIL", name, extra); };
const b = await chromium.launch();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const mk = async (vp = { width: 1100, height: 860 }) => { const c = await b.newContext({ viewport: vp, userAgent: UA }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const PH = /^(Player \d{4}), or type your name$/;
const dn = (p) => p.evaluate(() => localStorage.getItem("bb.dname"));
const home = async (p) => { await p.goto(S + "/"); await p.waitForSelector("#nm"); };
const startOn = (p) => p.locator("button.btn.big").isEnabled();

// 1) Fresh browser: empty field, placeholder shows the default name, Start enabled.
const P = await mk({ width: 390, height: 844 });
let mutationsBeforeStart = 0;
P.on("websocket", (ws) => ws.on("framesent", (f) => { if (/"type":"Mutation"/.test(String(f.payload))) mutationsBeforeStart++; }));
await home(P);
const ph = await P.locator("#nm").getAttribute("placeholder"); const m = ph?.match(PH); const name = m?.[1];
ok("empty name field shows 'Player NNNN, or type your name'", !!m && (await P.locator("#nm").inputValue()) === "", ph);
ok("default name is kept in this browser (localStorage bb.dname)", name && (await dn(P)) === name, await dn(P));
ok("Start is enabled with an empty name", await startOn(P));
ok("default name made client-side: no mutation sent before Start", mutationsBeforeStart === 0, String(mutationsBeforeStart));
await P.screenshot({ path: `${OUT}/01-home-empty-name-phone.png`, fullPage: false });
await P.reload(); await P.waitForSelector("#nm");
ok("reload keeps the same default name", (await P.locator("#nm").getAttribute("placeholder"))?.startsWith(name + ","));
await P.fill("#nm", "ab"); ok("1-2 typed characters still disable Start", !(await startOn(P)));
await P.fill("#nm", ""); ok("clearing the field enables Start again", await startOn(P));

// 2) Solo with an empty name: the battle shows the default name; leaderboard players tab knows it.
await P.click("button.mode:has-text('Solo')"); await P.click("button.btn.big");
await P.waitForURL(/\/play\/[0-9A-Za-z]{10}$/, { timeout: 15000 });
await P.waitForFunction((n) => document.body.innerText.includes(n), name, { timeout: 15000 }).catch(() => {});
ok("solo starts with an empty name and shows the default name", (await P.innerText("body")).includes(name));
await P.screenshot({ path: `${OUT}/02-solo-default-name.png` });
ok("typed name not saved when playing as default (bb.name empty)", !(await P.evaluate(() => localStorage.getItem("bb.name"))));
await P.goto(`${S}/leaderboard?tab=players`); await P.waitForSelector(".mystats", { timeout: 15000 }).catch(() => {});
ok("leaderboard players tab shows the default name", new RegExp(`${name}#`).test(await P.locator(".mystats").textContent().catch(() => "")), await P.locator(".mystats").textContent().catch(() => ""));
await P.screenshot({ path: `${OUT}/03-leaderboard-players.png` });
await home(P);
ok("home after a game: still the same default name, field still empty", (await P.locator("#nm").inputValue()) === "" && (await P.locator("#nm").getAttribute("placeholder"))?.startsWith(name + ","));

// 3) You vs Agent and Exhibition with an empty name.
const H2 = await mk(); await home(H2); const hn = await dn(H2);
await H2.click("button.mode:has-text('You vs Agent')"); ok("hva: Start enabled with empty name", await startOn(H2));
await H2.click("button.btn.big"); await H2.waitForURL(/\/play\//, { timeout: 15000 }).catch(() => {});
await H2.waitForFunction((n) => document.body.innerText.includes(n), hn, { timeout: 15000 }).catch(() => {});
ok("hva starts with an empty name and shows the default name", /\/play\//.test(H2.url()) && (await H2.innerText("body")).includes(hn), hn);
const X = await mk(); await home(X);
await X.click("button.mode:has-text('Exhibition')"); ok("exhibition: Start enabled with empty name", await startOn(X));
await X.click("button.btn.big"); await X.waitForURL(/\/g\//, { timeout: 15000 }).catch(() => {});
ok("exhibition starts with an empty name", /\/g\/[0-9A-Za-z]{10}/.test(X.url()), X.url());

// 4) Duel: host and invited guest both leave the name empty.
const D = await mk(); await home(D); const dname = await dn(D);
await D.click("button.mode:has-text('Duel')"); await D.click("button.btn.big");
await D.waitForURL(/\/play\//, { timeout: 15000 }); await D.waitForSelector("code.link"); const invite = await D.locator("code.link").textContent();
ok("duel host creates an invite with an empty name", /\/j\//.test(invite ?? ""));
const G = await mk({ width: 390, height: 844 }); await G.goto(invite); await G.waitForSelector("#nm2");
const gph = await G.locator("#nm2").getAttribute("placeholder"); const gname = gph?.match(PH)?.[1];
ok("invite page: empty field shows the guest's own default name", !!gname && (await G.locator("#nm2").inputValue()) === "" && gname === (await dn(G)), gph);
ok("invite page: Accept enabled with an empty name", await G.locator("button:has-text('Accept the battle')").isEnabled());
await G.screenshot({ path: `${OUT}/04-invite-empty-name-phone.png` });
await G.click("button.char:has-text('Sparkle')").catch(() => {}); await G.click("button:has-text('Accept the battle')");
await G.waitForURL(/\/play\//, { timeout: 15000 }).catch(() => {});
await D.waitForFunction((n) => document.body.innerText.includes(n), gname, { timeout: 20000 }).catch(() => {});
const dtext = await D.innerText("body");
ok("duel: host sees the guest's default name and its own", dtext.includes(gname) && dtext.includes(dname), `${dname} vs ${gname}`);
await D.screenshot({ path: `${OUT}/05-duel-default-names.png` });

// 5) Typed name overrides the default and is the one remembered.
const T = await mk(); await home(T); const tdef = await dn(T);
await T.fill("#nm", "Typed Tess"); await T.click("button.mode:has-text('Solo')"); await T.click("button.btn.big");
await T.waitForURL(/\/play\//, { timeout: 15000 });
await T.waitForFunction(() => document.body.innerText.includes("Typed Tess"), null, { timeout: 15000 }).catch(() => {});
const tt = await T.innerText("body");
ok("typed name overrides the default in the battle", tt.includes("Typed Tess") && !tt.includes(tdef));
await home(T);
ok("typed name persists across reload; default kept unchanged underneath", (await T.locator("#nm").inputValue()) === "Typed Tess" && (await dn(T)) === tdef);

// 6) Different browsers get their own names (no shared counter); any collision is harmless (tags differ).
const names = new Set([name, hn, await dn(X), dname, gname, tdef]);
ok("each browser draws its own default name", names.size >= 5, [...names].join(" | "));

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`, errors.length ? `\npage errors: ${errors.join(" | ")}` : "");
await b.close();
process.exit(results.every((r) => r.pass) && !errors.length ? 0 : 1);
