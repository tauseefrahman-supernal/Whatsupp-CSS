import Anthropic from "@anthropic-ai/sdk";
import { getPrompts } from "@/lib/vault/retrieve";
import type { AthleteProfile, GeneratedProtocol, ProtocolSessionLogRow } from "@/lib/db";

const MODEL = process.env.ANTHROPIC_MODEL_FAST ?? "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

interface GenerateInput {
  athlete: AthleteProfile;
  supplement: string;
  event: string;
  target?: string;
  sessions?: number;
}

const SYSTEM = `You are George, an AI supplement advisor calibrated on Dr Louise Burke's expertise. The athlete wants to test a supplement protocol on themselves through structured brick / training-block self-testing — an N-of-1 study.

Your job: produce a structured self-test protocol as JSON. Calibrate on the canonical Kona Ironman caffeine block in the Vault — same shape, same variables, but adapted to the specific athlete, event, and supplement in front of you.

OUTPUT: a single JSON object — no prose, no markdown fences, no preamble. The JSON must have exactly these keys:

{
  "title": "string — short title naming the block (e.g., 'Kona caffeine 6-session self-test')",
  "rationale": "string — 2-3 sentences explaining what we're trying to learn and why N-of-1 testing matters for this athlete's question",
  "sessions": [
    { "session": 1, "workout": "string", "focus": "string", "question": "string" },
    ...
  ],
  "log_variables": ["string", "string", ...],  // 8-14 variables the athlete should log per session
  "bottom_line": "string — 2-3 sentences summarising what success looks like at the end of the block"
}

Constraints:
- Number of sessions: respect the input, default to 6.
- Each session has a clear distinct focus (e.g., 'earlier dose', 'delayed dose', 'micro-dosing', 'repeat best candidate', 'heat-condition repeat', 'dress rehearsal').
- log_variables must include both objective measurements (e.g., bike power, run pace, heart rate, perceived exertion, supplement dose and timing) and subjective signals (e.g., gut comfort, mental focus, sleep quality, next-day recovery).
- title and rationale should match Louise's voice — empathetic, no hype.
- Do not include any text outside the JSON object.`;

/**
 * Generate a structured N-of-1 self-test protocol via Claude.
 */
export async function generateProtocol(input: GenerateInput): Promise<GeneratedProtocol> {
  const { soul, voice, guardrails } = getPrompts();
  const profile = input.athlete.profile ?? {};

  const userMessage = [
    `Athlete profile:`,
    `Name: ${input.athlete.name}`,
    input.athlete.sex && `Sex: ${input.athlete.sex}`,
    input.athlete.age != null && `Age: ${input.athlete.age}`,
    input.athlete.weight_kg != null && `Weight: ${input.athlete.weight_kg} kg`,
    input.athlete.sport && `Sport: ${input.athlete.sport}`,
    input.athlete.level && `Level: ${input.athlete.level}`,
    input.athlete.context && `Context: ${input.athlete.context}`,
    Object.keys(profile).length > 0 && `Profile facts: ${JSON.stringify(profile, null, 2)}`,
    ``,
    `Test parameters:`,
    `Supplement: ${input.supplement}`,
    `Event: ${input.event}`,
    input.target && `Target: ${input.target}`,
    input.sessions && `Number of sessions: ${input.sessions}`,
    ``,
    `Generate the protocol JSON now.`,
  ].filter(Boolean).join("\n");

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Voice reference:\n${voice}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Soul reference:\n${soul}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Guardrails:\n${guardrails}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const text = res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  const cleaned = text.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Generator returned non-JSON output: ${err instanceof Error ? err.message : String(err)}\n\nRaw: ${text.slice(0, 400)}`);
  }

  // Light shape validation
  const p = parsed as Record<string, unknown>;
  if (
    typeof p.title !== "string" ||
    typeof p.rationale !== "string" ||
    !Array.isArray(p.sessions) ||
    !Array.isArray(p.log_variables) ||
    typeof p.bottom_line !== "string"
  ) {
    throw new Error("Generator output missing required fields");
  }

  return parsed as GeneratedProtocol;
}

const SUMMARY_SYSTEM = `You are George, summarising an N-of-1 self-test block after the athlete has logged several sessions. Produce a concise 4-6 sentence narrative that:
1. Notes the strongest signal across sessions (which protocol felt best, which numbers improved).
2. Flags any contradictions or surprises.
3. Surfaces what's still uncertain.
4. Names a concrete next step (the recommended race-day protocol, OR another session to run).

Voice: Louise Burke's empathetic-but-direct register. Plain prose, no headings, no bullets, no markdown. Do not address the athlete by name more than once.`;

/**
 * Summarise N-of-1 sessions cross-protocol. Returns plain prose.
 */
export async function summariseSessionLogs(
  athlete: AthleteProfile,
  protocol: GeneratedProtocol,
  logs: ProtocolSessionLogRow[],
): Promise<string> {
  if (logs.length === 0) return "";

  const logsText = logs
    .map(l => {
      const session = protocol.sessions.find(s => s.session === l.session_idx);
      const data = l.data_json ? safeJson(l.data_json) : null;
      return [
        `Session ${l.session_idx}${session ? ` — ${session.focus}` : ""}:`,
        l.log ? `Notes: ${l.log}` : null,
        data ? `Data: ${JSON.stringify(data, null, 2)}` : null,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 600,
    system: SUMMARY_SYSTEM,
    messages: [{
      role: "user",
      content: `Athlete: ${athlete.name} (${athlete.sport ?? ""}, ${athlete.level ?? ""}).
Target: ${protocol.title}
Block rationale: ${protocol.rationale}

Logged sessions:
${logsText}

Summarise.`,
    }],
  });

  return res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
}

function safeJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}
