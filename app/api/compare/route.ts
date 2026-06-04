import type { NextRequest } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const Body = z.object({
  question: z.string().trim().min(1).max(8000),
});

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
const OPENAI_MODEL = process.env.OPENAI_MODEL_COMPARE ?? "gpt-5";

let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

function anthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function openai() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return Response.json(
      { error: "Invalid body", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // Run both in parallel. Each call is raw — no system prompt, no Vault grounding.
  // This is the honest "what would a generic LLM say to the same question" comparison.
  const [gptResult, claudeResult] = await Promise.allSettled([
    callOpenAI(body.question),
    callClaude(body.question),
  ]);

  return Response.json({
    question: body.question,
    gpt: settled(gptResult),
    claude: settled(claudeResult),
    models: { gpt: OPENAI_MODEL, claude: ANTHROPIC_MODEL },
  });
}

async function callOpenAI(question: string): Promise<string> {
  const res = await openai().responses.create({
    model: OPENAI_MODEL,
    input: question,
  });
  // Responses API exposes a convenience output_text accessor on the SDK.
  return res.output_text ?? "";
}

async function callClaude(question: string): Promise<string> {
  const res = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: question }],
  });
  // Flatten any text blocks into a single string.
  return res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n\n");
}

function settled<T>(r: PromiseSettledResult<T>): { ok: true; value: T } | { ok: false; error: string } {
  return r.status === "fulfilled"
    ? { ok: true, value: r.value }
    : { ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
}
