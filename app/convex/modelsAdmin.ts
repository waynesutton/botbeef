// Internal tooling for the per-game model swap: list the gateway's models and probe candidates with reasoning off.
// Results were used to build MODEL_OPTIONS in config.ts (the server-side allowlist). Not callable from clients.
import { v } from "convex/values";
import { getServiceToken } from "convex/server";
import { internalAction, internalQuery } from "./_generated/server";

const GW = "https://ai-gateway.convex.dev";
export const listModels = internalAction({
  args: { match: v.optional(v.string()) },
  handler: async (_ctx, a) => {
    const token = await getServiceToken("ai-gateway");
    const r = await fetch(`${GW}/v1/models`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { status: r.status, body: (await r.text()).slice(0, 500) };
    const j = (await r.json()) as { data?: { id: string; [k: string]: unknown }[] };
    const rx = a.match ? new RegExp(a.match, "i") : null;
    return (j.data ?? []).filter((m) => !rx || rx.test(m.id)).map((m) => ({ id: m.id, ...Object.fromEntries(Object.entries(m).filter(([k]) => ["context_length", "pricing", "name", "supported_parameters"].includes(k))) }));
  },
});
/** Probe models: a tiny completion with reasoning off; returns ok, latency and a sample. */
export const probe = internalAction({
  args: { models: v.array(v.string()), reasoning: v.optional(v.any()), maxTokens: v.optional(v.number()) },
  handler: async (_ctx, a) => {
    const token = await getServiceToken("ai-gateway");
    return await Promise.all(a.models.map(async (model) => {
      const t = Date.now();
      try {
        const c = new AbortController(); setTimeout(() => c.abort(), 20000);
        const r = await fetch(`${GW}/v1/chat/completions`, { method: "POST", signal: c.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: a.maxTokens ?? 60, reasoning: a.reasoning ?? { enabled: false }, messages: [{ role: "user", content: "In one funny sentence under 15 words, why do cats knock things off tables?" }] }) });
        const txt = await r.text();
        if (!r.ok) return { model, ok: false, ms: Date.now() - t, err: `${r.status} ${txt.slice(0, 160)}` };
        const j = JSON.parse(txt);
        const out = (j.choices?.[0]?.message?.content ?? "").trim();
        return { model, ok: out.length > 3, ms: Date.now() - t, out: out.slice(0, 100) };
      } catch (e) { return { model, ok: false, ms: Date.now() - t, err: String(e).slice(0, 160) }; }
    }));
  },
});

/** e2e: which model each corner's answer was generated with. */
export const answerModels = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, a) => {
    const g = await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", a.slug)).unique();
    if (!g) return null;
    const rows = await ctx.db.query("answers").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect();
    return rows.sort((x, y) => x.corner - y.corner).map((r) => r.model);
  },
});

/** Art tooling: one image from the gateway (used once to make Jev's plush art). Returns a URL or base64. */
export const image = internalAction({
  args: { model: v.string(), prompt: v.string(), image: v.optional(v.any()), aspect_ratio: v.optional(v.string()) },
  handler: async (_ctx, a) => {
    const token = await getServiceToken("ai-gateway");
    const r = await fetch(`${GW}/v1/images/generations`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ...a, n: 1 }) });
    const t = await r.text();
    if (!r.ok) return { error: r.status, body: t.slice(0, 600) };
    const j = JSON.parse(t); const d = j.data?.[0] ?? {};
    return { url: d.url ?? null, b64: d.b64_json ?? null };
  },
});
