// /bots: every bot as a plush trading card, with Jev (the judge) featured on top. Tap any puppet for the 2D expand view.
import { useEffect } from "react";
import { I } from "./icons";
import { Avatar, Link } from "./ui";
import { BOTS_DESC, GATEWAY_URL, JUDGE, JUDGE_CARD, botsList } from "../convex/bots";
import { HowItWorks } from "./HowItWorks";

const pad = (n: number) => String(n).padStart(2, "0");

export function Bots() {
  useEffect(() => { document.title = "Meet the bots · Bot Battle"; }, []);
  const bots = botsList();
  return (
    <div className="bots">
      <header className="bots-h">
        <h1>Meet the bots</h1>
        <p className="sub">{bots.length} plush contenders and one very fair judge. Tap any of them to see them up close; tap again for their next move.</p>
      </header>

      <section className="judge" aria-labelledby="judge-h" style={{ ["--c" as string]: JUDGE.color }}>
        <div className="judge-art"><Avatar id="jev" size={196} full anim expand="Jev, the judge" /></div>
        <div className="judge-t">
          <span className="judge-k"><I n="gavel" size={16} /> {JUDGE_CARD.title}</span>
          <h2 id="judge-h">Jev</h2>
          <p className="judge-tag">{JUDGE_CARD.tagline}</p>
          <p>{JUDGE_CARD.how}</p>
          <p className="judge-cr"><I n="cpu" size={14} /> {JUDGE_CARD.credit} via the <a href={GATEWAY_URL} target="_blank" rel="noopener">Convex AI Gateway</a>.</p>
        </div>
      </section>

      <ul className="tcards" aria-label="The bots">
        {bots.map((b) => (
          <li key={b.id} className="tcard" data-id={b.id} style={{ ["--c" as string]: b.color }}>
            <div className="tc-top"><span className="tc-no">No. {pad(b.no)}</span><span className="tc-vibe">{b.vibe}</span></div>
            <div className="tc-art"><Avatar id={b.id} size={150} full anim expand={b.name} /></div>
            <h3>{b.name}</h3>
            <p className="tc-tag">{b.card.tagline}</p>
            <dl className="tc-stats">
              <div><dt><I n="zap" size={14} /> Signature move</dt><dd>{b.card.move}</dd></div>
              <div><dt><I n="cpu" size={14} /> Default model</dt><dd className="tc-model" data-model={b.def.model}>{b.def.label}</dd></div>
              <div><dt><I n="layers" size={14} /> Swap-in models</dt><dd className="tc-alts" data-alts={b.alts}>{b.alts ? `+${b.alts} more` : "Just the one"}</dd></div>
            </dl>
          </li>
        ))}
      </ul>

      <section className="card bots-gw">
        <h2>Where the models come from</h2>
        <p>Every bot runs on a real model from its own company, served through the <a href={GATEWAY_URL} target="_blank" rel="noopener">Convex AI Gateway <I n="out" size={12} /></a>. The swap-in models are the gateway's available models from that same family that answer fast with deep thinking off. Pick one for a single game with the small <I n="info" size={14} label="info" /> on a bot's card when you start a battle.</p>
        <p className="muted">{BOTS_DESC}</p>
        <p className="row" style={{ gap: 8, flexWrap: "wrap" }}><Link to="/" className="btn">Start a battle</Link><Link to="/leaderboard?tab=models" className="btn ghost"><I n="chart" size={16} /> Model scoreboard</Link></p>
      </section>

      <HowItWorks />
    </div>
  );
}
