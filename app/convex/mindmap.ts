// Pele mode: turn finished words into a Mermaid mindmap. Shared by the client (drawing) and Jev (node count).
// Root = the question. Each clause (split on . , ; ! ? and/but/because/so/then) becomes a branch; a branch label
// holds up to 3 non-filler words, overflow words become child leaves. The word still being typed is never drawn,
// players never write Mermaid, and every label is reduced to letters/digits so the source always parses.
export const MAP_BRANCHES = 6, MAP_LEAVES = 2, MAP_WORDS = 3, MAP_WORD_CHARS = 14;
const FILLER = /^(the|a|an|of|to|is|are|was|be|it|its|it's|and|but|so|because|then|that|this|with|for|on|in|at|as|by|or|i|you|we|my|your|our)$/i;
const VERB0 = /^(explain|write|give|describe|pitch|invent|argue|create|announce|report|leave|solve|plan|apologize|rename|sell|roast|convince|make|tell|why|how|what)$/i;
const clean = (w: string) => w.normalize("NFKC").replace(/[^\p{L}\p{N}'-]/gu, "").replace(/^['-]+|['-]+$/g, "").slice(0, MAP_WORD_CHARS);

export type MapModel = { root: string; branches: { label: string; leaves: string[] }[] };

export function mapRoot(question: string) {
  const ws = question.split(/\s+/).map(clean).filter((w) => w && !FILLER.test(w));
  let k = 0; while (k < ws.length - 1 && VERB0.test(ws[k])) k++;
  const body = ws.slice(k);
  return (body.length ? body : ws).slice(0, 2).join(" ") || "Question";
}

export function buildMap(question: string, text: string, finishedOnly = true): MapModel {
  const done = !finishedOnly || /\s$/.test(text) ? text : text.replace(/\S+$/, "");
  const clauses = done.split(/[.,;:!?\n]+|\b(?:and|but|because|so|then)\b/i)
    .map((c) => c.trim().split(/\s+/).map(clean).filter((w) => w && !FILLER.test(w)))
    .filter((c) => c.length);
  const branches = clauses.slice(0, MAP_BRANCHES).map((c) => {
    const leaves: string[] = [];
    for (let i = MAP_WORDS; i < c.length && leaves.length < MAP_LEAVES; i += MAP_WORDS) leaves.push(c.slice(i, i + MAP_WORDS).join(" "));
    return { label: c.slice(0, MAP_WORDS).join(" "), leaves };
  });
  return { root: mapRoot(question), branches };
}

export const mapNodes = (m: MapModel) => m.branches.reduce((n, b) => n + 1 + b.leaves.length, 0);

export function toMermaid(m: MapModel) {
  const lines = ["mindmap", `  root((${m.root}))`];
  for (const b of m.branches) { lines.push(`    ${b.label}`); for (const l of b.leaves) lines.push(`      ${l}`); }
  return lines.join("\n");
}
