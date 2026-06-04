import Anthropic from "@anthropic-ai/sdk";
import { getPrompts, buildVaultContext } from "@/lib/vault/retrieve";
import type { AthleteProfile, MessageRow } from "@/lib/db";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
const SUMMARY_MODEL = process.env.ANTHROPIC_MODEL_FAST ?? "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface StreamEvent {
  type: "text" | "meta" | "done" | "error";
  text?: string;
  meta?: Record<string, unknown>;
  message?: string;
}

interface GeorgeRunOptions {
  athlete: AthleteProfile;
  history: MessageRow[];        // prior messages in this session
  userMessage: string;          // the new message from the athlete
  channel: "text" | "voice";
  lastSummary?: string | null;  // recall block from prior session(s)
}

/**
 * Stream a response from George. Yields SSE-style events that the route handler
 * forwards to the browser.
 */
export async function* streamGeorge(opts: GeorgeRunOptions): AsyncGenerator<StreamEvent> {
  const prompts = getPrompts();
  const vaultCtx = buildVaultContext(opts.userMessage, opts.athlete);
  const memoryBlock = buildMemoryBlock(opts.athlete, opts.lastSummary);

  const hasAssistantInHistory = opts.history.some(m => m.role === "assistant");
  const isReturning = hasAssistantInHistory || !!opts.lastSummary;
  const isBlankSlate = !opts.athlete.sport && !opts.athlete.context && !isReturning;
  const isFreshSessionForReturningAthlete = !hasAssistantInHistory && !!opts.lastSummary;

  // System prompt — 4 cached blocks (static across requests) + 1 dynamic block.
  const system: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: prompts.soul, cache_control: { type: "ephemeral" } },
    { type: "text", text: prompts.system, cache_control: { type: "ephemeral" } },
    { type: "text", text: prompts.voice, cache_control: { type: "ephemeral" } },
    { type: "text", text: prompts.guardrails, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: [
        `## Channel\n${opts.channel}`,
        memoryBlock,
        vaultCtx,
        `## Mode hint\nThe athlete ${
          isBlankSlate
            ? "has no profile yet — treat this as **blank slate** mode and gather context conversationally."
            : isFreshSessionForReturningAthlete
              ? "is returning after a break. This is a fresh conversation. Open with a short, warm welcome-back (1-2 sentences) that references the prior topic from the memory summary above. Ask one open question about how things went or what they want to work on now. Do not dive into a recap."
              : isReturning
                ? "is mid-conversation. Stay in the flow — do not re-greet, do not summarise back."
                : "is new but has some profile data. Read their opening message to decide between **posed-question** and **blank-slate** mode."
        }`,
        `## Closing instruction\nAt the end of your reply, on a new line, emit a single JSON object wrapped in <meta>...</meta> tags with these keys:\n` +
        `  - confidence_overall (high|moderate|low)\n` +
        `  - recent (high|moderate|low)\n` +
        `  - relevant (high|moderate|low)\n` +
        `  - robust (high|moderate|low)\n` +
        `  - wise_crowd_cta (boolean — true if you offered to organise the Wise Crowd this turn)\n` +
        `  - profile_updates (object of profile facts you learned this turn, empty {} if none)\n` +
        `  - protocol_card (optional object — emit ONLY when the athlete has just accepted your offer to build an N-of-1 self-test block. Shape: { title: string, rationale: string (1 sentence), sessions: [{ session: number, workout: string (3-6 words), focus: string (2-5 words), question: string (single sentence) }], log_variables: string[] (6-12 short strings), bottom_line: string (1 sentence), cta_url: "/protocols?a=<athleteId>", cta_label: "Open in Protocols workspace" }. When you emit protocol_card, keep your prose message above the meta SHORT — one or two sentences introducing the block — because the UI will render the protocol table as a structured card; do not duplicate the table in prose.)\n` +
        `Do not narrate the meta block. Do not surround it with prose. It must be the last thing in your output. The JSON must parse cleanly.`,
      ].join("\n\n"),
    },
  ];

  const messages: Anthropic.Messages.MessageParam[] = [
    ...opts.history.map(toMessageParam),
    { role: "user", content: opts.userMessage },
  ];

  try {
    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages,
    });

    let buffer = "";
    let metaFound = false;
    let metaText = "";

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const chunk = event.delta.text;
        buffer += chunk;

        // Look for the meta tag once we see it
        const metaStart = buffer.indexOf("<meta>");
        if (metaStart >= 0) {
          if (!metaFound) {
            // Emit everything up to <meta> as text, then stop streaming text
            const before = buffer.slice(0, metaStart);
            const lastFlushed = buffer.length - chunk.length;
            if (metaStart > lastFlushed) {
              const remainder = before.slice(lastFlushed);
              if (remainder) yield { type: "text", text: remainder };
            }
            metaFound = true;
            metaText = buffer.slice(metaStart);
          } else {
            metaText = buffer.slice(metaStart);
          }
        } else {
          yield { type: "text", text: chunk };
        }
      }
    }

    // Parse meta if present
    if (metaFound) {
      const match = metaText.match(/<meta>([\s\S]*?)<\/meta>/);
      if (match) {
        try {
          const meta = JSON.parse(match[1].trim());
          yield { type: "meta", meta };
        } catch {
          // ignore malformed meta
        }
      }
    }

    yield { type: "done" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message };
  }
}

function buildMemoryBlock(athlete: AthleteProfile, lastSummary?: string | null): string {
  const lines = ["## Athlete memory"];
  lines.push(`Name: ${athlete.name}`);
  if (athlete.sex) lines.push(`Sex: ${athlete.sex}`);
  if (athlete.age != null) lines.push(`Age: ${athlete.age}`);
  if (athlete.weight_kg != null) lines.push(`Weight: ${athlete.weight_kg} kg`);
  if (athlete.sport) lines.push(`Sport: ${athlete.sport}`);
  if (athlete.level) lines.push(`Level: ${athlete.level}`);
  if (athlete.context) lines.push(`Context: ${athlete.context}`);

  const profile = athlete.profile ?? {};
  const entries = Object.entries(profile).filter(([, v]) => v != null && v !== "");
  if (entries.length > 0) {
    lines.push("Profile facts:");
    for (const [k, v] of entries) {
      lines.push(`  - ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
    }
  }

  if (lastSummary) {
    lines.push(`\nLast conversation summary:\n${lastSummary}`);
  } else if (!athlete.sport && !athlete.context && entries.length === 0) {
    lines.push("\n(This is a new athlete with no profile yet. Build their picture conversationally — do not ask them to fill out a form.)");
  }

  return lines.join("\n");
}

function toMessageParam(m: MessageRow): Anthropic.Messages.MessageParam {
  if (m.role === "user") return { role: "user", content: m.content };
  return { role: "assistant", content: m.content };
}

/**
 * Summarise a closed session into 1–2 sentences. Used when starting a new
 * conversation, so George can recall the prior topic when greeting the
 * athlete back.
 */
export async function summariseSession(athleteName: string, messages: MessageRow[]): Promise<{ topic: string; summary: string } | null> {
  const usable = messages.filter(m => m.role === "user" || m.role === "assistant");
  if (usable.length < 2) return null;

  const transcript = usable
    .map(m => `${m.role === "user" ? athleteName.toUpperCase() : "GEORGE"}: ${m.content}`)
    .join("\n\n");

  const res = await client().messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 400,
    system: "You summarise conversations between George (an AI supplement advisor) and an athlete, for the purpose of George recalling the conversation next time the athlete returns.\n\nReturn a single-line JSON object with exactly two keys: `topic` (a 2–6 word phrase naming what was discussed, e.g. 'AFLW caffeine for night final', 'Kona caffeine self-test plan') and `summary` (1–2 sentences capturing what was decided or what's still open, using the athlete's name). No prose, no preamble, no markdown. Just the JSON.",
    messages: [{ role: "user", content: `Transcript:\n\n${transcript}\n\nReturn the JSON.` }],
  });

  const text = res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  // Strip code fences if model wrapped output
  const cleaned = text.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.topic === "string" && typeof parsed.summary === "string") {
      return { topic: parsed.topic, summary: parsed.summary };
    }
  } catch { /* fall through */ }
  return null;
}
