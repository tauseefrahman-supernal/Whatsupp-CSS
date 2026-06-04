import type { NextRequest } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { getAthlete, getOrCreateSession, getPriorSession } from "@/lib/db";
import { buildVoiceInstructions } from "@/lib/vault/voice-instructions";

const Body = z.object({
  athleteId: z.string().min(1),
  voice: z.string().trim().min(1).max(40).optional(),
  // When true, George leads the conversation with a warm intro and gathers
  // the profile through dialogue rather than waiting for the athlete to start.
  onboarding: z.boolean().optional(),
});

const ALLOWED_VOICES = new Set([
  "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar",
]);

const MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const VOICE = process.env.OPENAI_TTS_VOICE ?? "ballad";

let _openai: OpenAI | null = null;
function openai() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * POST /api/george/voice
 *
 * Mints an ephemeral Realtime client secret pre-configured with George's full
 * system instructions, voice, and Vault knowledge so the browser can connect
 * directly to OpenAI Realtime over WebRTC without exposing our API key.
 */
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

  const athlete = getAthlete(body.athleteId);
  if (!athlete) return Response.json({ error: "Unknown athlete" }, { status: 404 });

  const session = getOrCreateSession(athlete.id);
  const prior = getPriorSession(athlete.id, session.id);
  const lastSummary = prior?.summary ?? null;

  const baseInstructions = buildVoiceInstructions(athlete, lastSummary);
  const onboardingDirective = body.onboarding ? `

## ONBOARDING VOICE MODE — active for this session

You are hosting a first-meeting with this athlete. They have just connected and you should speak first.

Open with a warm hello (one or two sentences) that introduces you as George, the AI Supplement Counsel inside WhatSupp, and that says — in your own voice — that you'd rather have a conversation than ask them to fill out a form. Then ask ONE opening question about their sporting life. Wait.

Build the picture across the next 8–12 short turns, one question at a time, in this rough order — but follow the conversation, don't force the order:
  1. Sport, level, what they're training for
  2. Supplements they currently use (caffeine, bicarb, beta-alanine, creatine, nitrate, others)
  3. How those have actually felt — any sensitivities, reactions, jitters, sleep impact
  4. Sleep and work / life context that affects recovery
  5. The question on their mind today (this is the prize — let it surface naturally)

After every two or three answers, reflect back what you heard in a single sentence before moving on. This is how trust is built.

Drop the privacy reassurance early, naturally, not as a disclaimer: "Anything you tell me stays here — when I bring something to the Wise Crowd, they see the scenario, not the name."

End the onboarding when you have enough to be useful. Say so. Suggest a first thing you could dig into together.
` : "";
  const instructions = baseInstructions + onboardingDirective;
  const requestedVoice = body.voice && ALLOWED_VOICES.has(body.voice) ? body.voice : VOICE;

  try {
    const secret = await openai().realtime.clientSecrets.create({
      session: {
        type: "realtime",
        model: MODEL,
        instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: { type: "semantic_vad", eagerness: "medium", interrupt_response: true },
          },
          output: {
            voice: requestedVoice,
            // Slight slowdown — pushes the delivery into the considered "older counsel"
            // register instead of the default brisk pace. 0.95 ≈ 5% slower.
            speed: 0.95,
          },
        },
      },
      expires_after: { anchor: "created_at", seconds: 600 }, // 10 minutes
    });

    return Response.json({
      clientSecret: secret.value,
      model: MODEL,
      voice: requestedVoice,
      sessionId: session.id,
      expiresAt: secret.expires_at,
    });
  } catch (err) {
    console.error("voice session create failed:", err);
    return Response.json(
      { error: "Could not create voice session", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
