// Convex AI Gateway helpers: chat (optionally streamed) and Jev decisions. Every call records its cost.
import { getServiceToken } from "convex/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Reasoning } from "./config";

const GW = "https://ai-gateway.convex.dev";
type Usage = { cost?: number };

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

export async function record(ctx: ActionCtx, gameId: Id<"games"> | undefined, usage: Usage | undefined) {
  await ctx.runMutation(internal.spend.record, { gameId, usd: usage?.cost ?? 0 });
}

export type Msg = { role: "system" | "user"; content: string };
export async function chat(ctx: ActionCtx, gameId: Id<"games"> | undefined, model: string, messages: Msg[], opts: { maxTokens: number; reasoning?: Reasoning; onDelta?: (text: string) => Promise<void> }) {
  const body = { model, messages, max_tokens: opts.maxTokens, ...(opts.reasoning ? { reasoning: opts.reasoning } : {}), ...(opts.onDelta ? { stream: true, stream_options: { include_usage: true } } : {}) };
  const r = await gw("/v1/chat/completions", body, timeout(25_000));
  if (!opts.onDelta) {
    const j = (await r.json()) as { choices: { message: { content: string | null } }[]; usage?: Usage };
    await record(ctx, gameId, j.usage);
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
        text += j.choices?.[0]?.delta?.content ?? "";
        if (j.usage) usage = j.usage;
      } catch { /* partial line */ }
    }
    if (Date.now() - last > 200 && text) { last = Date.now(); await opts.onDelta(text); }
  }
  await record(ctx, gameId, usage);
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

export async function decide(ctx: ActionCtx, gameId: Id<"games"> | undefined, model: string, state: unknown, questions: Record<string, Question>) {
  const r = await gw("/alpha/decisions", { model, state, questions }, timeout(6_000));
  const j = (await r.json()) as { answers: Record<string, Answer>; usage?: Usage };
  await record(ctx, gameId, j.usage);
  return j.answers;
}
