import Anthropic from "@anthropic-ai/sdk";
import { getExperts, getPrompts } from "@/lib/vault/retrieve";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST ?? "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface Expert {
  id: string;
  name: string;
  affiliation?: string;
  domains?: string[];
  bio?: string;
  voice_notes?: string;
}

export function listExperts(): Expert[] {
  return (getExperts() as unknown as Expert[]) ?? [];
}

export function findExpert(id: string): Expert | null {
  return listExperts().find(e => e.id === id) ?? null;
}

/**
 * Build a persona prompt for a specific named expert.
 */
function buildExpertPersona(expert: Expert): string {
  return [
    `You are ${expert.name}${expert.affiliation ? `, ${expert.affiliation}` : ""}.`,
    expert.domains?.length ? `Your domains of expertise: ${expert.domains.join(", ")}.` : null,
    expert.bio ? `Background: ${expert.bio}` : null,
    expert.voice_notes ? `Voice & style: ${expert.voice_notes}` : null,
    "",
    "You are being consulted by George (an AI supplement advisor) on a specific athlete question. Respond as you would — in your voice, from your domain.",
    "",
    "Constraints:",
    "- Stay in your domain. If the question is at the edge of your expertise, name what you're confident about and what you're uncertain about.",
    "- Be specific. Name doses, timing, ranges, and the reasoning behind them.",
    "- 100–180 words. No headings, no bullets, no markdown. Plain prose.",
    "- Do not address the athlete directly — you're talking to George about the athlete.",
    "- End with a one-sentence position George can quote.",
  ].filter(Boolean).join("\n");
}

/**
 * Consult a single anonymous panel member (AI-expert style).
 */
export async function consultExpert(expertId: string, question: string): Promise<string> {
  const expert = findExpert(expertId);
  if (!expert) throw new Error(`Unknown expert: ${expertId}`);

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 600,
    system: buildExpertPersona(expert),
    messages: [{ role: "user", content: `Question from George:\n\n${question}\n\nYour take?` }],
  });

  return res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
}

/**
 * Consult the full Wise Crowd. Runs 10 expert calls in parallel, then synthesises.
 */
export interface CrowdResult {
  experts: Array<{ expert: Expert; response: string; ok: boolean; error?: string }>;
  consensus: string;
}

export async function consultCrowd(question: string): Promise<CrowdResult> {
  const experts = listExperts();
  if (experts.length === 0) throw new Error("No experts available");

  // Parallel expert calls
  const settled = await Promise.allSettled(
    experts.map(e =>
      client().messages.create({
        model: MODEL_FAST,
        max_tokens: 500,
        system: buildExpertPersona(e),
        messages: [{ role: "user", content: `Question from George:\n\n${question}\n\nYour take?` }],
      }).then(res => res.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim()),
    ),
  );

  const expertOpinions = experts.map((e, i) => {
    const s = settled[i];
    if (s.status === "fulfilled") {
      return { expert: e, response: s.value, ok: true as const };
    }
    return {
      expert: e,
      response: "",
      ok: false as const,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });

  // Synthesis call — aggregate into the wotc-race-walk.json style format
  const successfulOpinions = expertOpinions.filter(o => o.ok);
  const consensus = await synthesiseCrowd(question, successfulOpinions);

  return { experts: expertOpinions, consensus };
}

const SYNTHESIS_SYSTEM = `You are George, aggregating responses from a panel of sports-nutrition experts on a single athlete question.

Your job is to produce a structured wisdom-of-crowd consensus document in plain markdown. Use this exact shape:

## The crowd's view

A 2-3 sentence narrative summary of where the experts converge.

## Per-variable consensus

For each substantive variable the experts addressed (dose, timing, form, context, safety, etc.), one bullet:
- **Variable:** consensus position. (Cite specific experts in parentheses where helpful.)

## Genuine disagreement

If there are points where experts genuinely diverge, list them as bullets. If consensus is strong, say so explicitly and skip this section.

## Master protocol

A clean numbered list of the final integrated recommendation the athlete should actually do. Concrete. Specific. Doses, timings, conditions.

## What the crowd adds beyond a solo expert

2-4 bullets calling out individual expert insights that would NOT have surfaced in a single-expert answer.

Voice: Louise Burke's empathetic-but-direct register, but with the structure of a domain-specific consensus document. No emojis. No hype. No "I" — speak about "the panel" and "the crowd".`;

async function synthesiseCrowd(
  question: string,
  opinions: Array<{ expert: Expert; response: string }>,
): Promise<string> {
  const opinionsText = opinions
    .map(o => `### ${o.expert.name} (${(o.expert.domains ?? []).join(", ")})\n${o.response}`)
    .join("\n\n");

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYNTHESIS_SYSTEM,
    messages: [{
      role: "user",
      content: `Athlete question:\n\n${question}\n\nExpert responses:\n\n${opinionsText}\n\nProduce the consensus document.`,
    }],
  });

  return res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
}

/**
 * "Live" expert routing — same as consultExpert but with an artificial delay
 * to simulate the 24–48h SLA of real expert routing, compressed to ~10s for demo.
 */
export async function consultLiveExpert(expertId: string, question: string, delayMs = 8000): Promise<string> {
  await new Promise(r => setTimeout(r, delayMs));
  return consultExpert(expertId, question);
}

export { getPrompts };
