import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getExperts } from "@/lib/vault/retrieve";

export async function GET() {
  const contentDir = join(process.cwd(), "lib", "vault", "content");
  let scenarios = 0;
  try {
    scenarios = readdirSync(contentDir)
      .filter(f => f.endsWith(".json") && f !== "experts.json")
      .length;
  } catch { /* ignore */ }

  const experts = getExperts().length;

  return Response.json({
    keys: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
    },
    models: {
      anthropic: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
      anthropic_fast: process.env.ANTHROPIC_MODEL_FAST ?? "claude-sonnet-4-6",
      openai_compare: process.env.OPENAI_MODEL_COMPARE ?? "gpt-5",
      openai_realtime: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
    },
    vault: {
      scenarios,
      experts,
    },
  });
}
