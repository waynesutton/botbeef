// Convex AI Gateway helpers: chat (optionally streamed) and Jev decisions. Every call records its cost.
import { getServiceToken } from "convex/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Reasoning } from "./config";

const GW = "https://ai-gateway.convex.dev";
type Usage = { cost?: number; prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
/** What a call was for (model scoreboard). `bot` is the character id for fighter answers. No prompt text is ever logged. */
export type Purpose = "answer" | "refresh" | "score" | "setup" | "moderation" | "verdict" | "other";
export type Tag = { purpose: Purpose; bot?: string };
const errKind = (e: unknown) => {
  const m = String((e as Error)?.message ?? e);
  if ((e as Error)?.name === "AbortError" || /abort/i.test(m)) return "timeout";
  const h = m.match(/^gateway \S+ (\d{3})/);
  if (h) return h[1] === "429" ? "rate_limited" : h[1].startsWith("5") ? "http_5xx" : "http_4xx";
  return /json|parse/i.test(m) ? "bad_response" : "error";
};

function timeout(ms: number) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
async function gw(path: string, body: unknown, signal?: AbortSignal) {
  const token = await getServiceToken("ai-gateway");
  const r = await fetch(GW + path, {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`gateway ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

type Call = { model: string; tag?: Tag; t0: number; ttft?: number; err?: unknown };
/** One blind insert per call: the spend log row (cost) and the aiCalls row (model scoreboard), both append-only. */
export async function record(ctx: ActionCtx, gameId: Id<"games"> | undefined, usage: Usage | undefined, call?: Call) {
  const c = call && {
    model: call.model, purpose: call.tag?.purpose ?? "other", ...(call.tag?.bot ? { bot: call.tag.bot } : {}),
    ms: Date.now() - call.t0, ...(call.ttft !== undefined ? { ttft: call.ttft } : {}),
    ...(usage?.prompt_tokens ?? usage?.input_tokens) !== undefined ? { tin: usage!.prompt_tokens ?? usage!.input_tokens } : {},
    ...(usage?.completion_tokens ?? usage?.output_tokens) !== undefined ? { tout: usage!.completion_tokens ?? usage!.output_tokens } : {},
    ok: call.err === undefined, ...(call.err !== undefined ? { err: errKind(call.err) } : {}),
  };
  try { await ctx.runMutation(internal.spend.record, { gameId, usd: usage?.cost ?? 0, ...(c ? { call: c } : {}) }); }
  catch (e) { console.warn("record failed", String(e)); } // logging never breaks a game
}
/** Run one gateway call; on failure log it as an error row, then rethrow so callers keep their fallbacks. */
async function logged<T>(ctx: ActionCtx, gameId: Id<"games"> | undefined, model: string, tag: Tag | undefined, fn: (call: Call) => Promise<T>) {
  const call: Call = { model, tag, t0: Date.now() };
  try { return await fn(call); }
  catch (e) { await record(ctx, gameId, undefined, { ...call, err: e }); throw e; }
}

export type Msg = { role: "system" | "user"; content: string };
export async function chat(ctx: ActionCtx, gameId: Id<"games"> | undefined, model: string, messages: Msg[], opts: { maxTokens: number; reasoning?: Reasoning; onDelta?: (text: string) => Promise<void>; tag?: Tag }) {
  return logged(ctx, gameId, model, opts.tag, (call) => chatInner(ctx, gameId, model, messages, opts, call));
}
async function chatInner(ctx: ActionCtx, gameId: Id<"games"> | undefined, model: string, messages: Msg[], opts: { maxTokens: number; reasoning?: Reasoning; onDelta?: (text: string) => Promise<void> }, call: Call) {
  const body = { model, messages, max_tokens: opts.maxTokens, ...(opts.reasoning ? { reasoning: opts.reasoning } : {}), ...(opts.onDelta ? { stream: true, stream_options: { include_usage: true } } : {}) };
  const r = await gw("/v1/chat/completions", body, timeout(25_000));
  if (!opts.onDelta) {
    const j = (await r.json()) as { choices: { message: { content: string | null } }[]; usage?: Usage };
    await record(ctx, gameId, j.usage, call);
    return (j.choices[0]?.message.content ?? "").trim();
  }
  // SSE: push the accumulated text at most every ~200ms.
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", last = 0, usage: Usage | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; usage?: Usage };
        const d = j.choices?.[0]?.delta?.content ?? "";
        if (d && call.ttft === undefined) call.ttft = Date.now() - call.t0;
        text += d;
        if (j.usage) usage = j.usage;
      } catch { /* partial line */ }
    }
    if (Date.now() - last > 200 && text) { last = Date.now(); await opts.onDelta(text); }
  }
  await record(ctx, gameId, usage, call);
  return text.trim();
}

export type Answer =
  | { type: "score"; score: number; confidence?: number }
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence?: number; probabilities?: Record<string, number> };
export type Question =
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };

export async function decide(ctx: ActionCtx, gameId: Id<"games"> | undefined, model: string, state: unknown, questions: Record<string, Question>, tag?: Tag) {
  return logged(ctx, gameId, model, tag, async (call) => {
    const r = await gw("/alpha/decisions", { model, state, questions }, timeout(6_000));
    const j = (await r.json()) as { answers: Record<string, Answer>; usage?: Usage };
    await record(ctx, gameId, j.usage, call);
    return j.answers;
  });
}
