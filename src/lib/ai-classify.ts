import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { aiProvider } from "./sector-detect";

/**
 * Classe une liste de libellés dans un ensemble de valeurs imposées, via Claude ou OpenAI
 * (selon la clé configurée). Renvoie null pour chaque libellé non classé ou en cas d'échec.
 */
export async function classifyWithEnum(opts: {
  system: string;
  items: string[];
  values: readonly string[];
}): Promise<(string | null)[]> {
  const provider = aiProvider();
  if (!provider || opts.items.length === 0) return opts.items.map(() => null);

  const schema = {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "integer" }, value: { type: "string", enum: [...opts.values] } },
          required: ["id", "value"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  };
  const user = `Libellés à classer (un par ligne, au format id|libellé) :\n${opts.items.map((t, i) => `${i}|${t}`).join("\n")}`;

  try {
    let text: string | null = null;
    if (provider === "anthropic") {
      const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
      const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
      const opusClass = /^claude-(opus-5|fable-5)/.test(model);
      const res = await client.beta.messages.create({
        model,
        max_tokens: 8000,
        ...(opusClass ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: {
          ...(opusClass ? { effort: "low" as const } : {}),
          format: { type: "json_schema", schema },
        },
        system: opts.system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "end_turn") text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    } else {
      const client = new OpenAI({ timeout: 45_000, maxRetries: 1 });
      const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
      const res = await client.chat.completions.create({
        model,
        max_completion_tokens: 8000,
        ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" as const } : {}),
        response_format: { type: "json_schema", json_schema: { name: "classement", strict: true, schema } },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: user },
        ],
      });
      const choice = res.choices[0];
      if (choice?.finish_reason === "stop" && !choice.message.refusal) text = choice.message.content;
    }
    if (!text) return opts.items.map(() => null);
    const parsed = JSON.parse(text) as { results: { id: number; value: string }[] };
    const byId = new Map(parsed.results.map((r) => [r.id, r.value]));
    return opts.items.map((_, i) => {
      const v = byId.get(i);
      return v && opts.values.includes(v) ? v : null;
    });
  } catch (err) {
    console.error("Classification IA en échec", err);
    return opts.items.map(() => null);
  }
}
