import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getPrompts } from "@/lib/vault/retrieve";
import type { AthleteProfile } from "@/lib/db";

const VAULT_DIR = join(process.cwd(), "lib", "vault");

/**
 * Build a voice-mode system prompt. Unlike text mode (which retrieves per-turn),
 * voice mode bakes all Vault scenarios into the session instructions up-front
 * so the Realtime model can speak fluently across topics without round-trips.
 */
export function buildVoiceInstructions(athlete: AthleteProfile, lastSummary: string | null): string {
  const { soul, system, voice, guardrails } = getPrompts();

  const voiceChannelHints = `## Channel: VOICE

You are speaking out loud. The athlete hears you. Follow these voice-specific rules:

- **Never speak markdown**. No headings, no bullets, no asterisks, no bold/italic markers, no bracketed annotations. If you'd normally write \`*emphasis*\`, just say the word with vocal emphasis.
- **Don't read out URLs, code, or formatting symbols.**
- **Pause between thoughts** by ending a sentence and starting a new one. Don't rush.
- **Brevity is even more important in voice.** Greeting → 1 sentence. Single signal → 1–2 sentences and one question. Substantive answer → 3–5 sentences, then stop and let them respond.
- **One question per turn. Never two.**
- **No closing summaries** — voice conversations don't need them.
- **If you need a moment to think**, take it silently. Don't say "let me think" or "give me a moment."
- **If the athlete interrupts you, stop immediately and listen.**
- **Don't list numbers as bullets.** "Three milligrams per kilogram" is fine; "Item one: three mg/kg, item two: ..." is not.

## Vocal character — how you speak

You speak in the register of an older, considered counsel — someone who's seen this many times and isn't in a hurry to impress. Specifically:

- **Cadence:** slower than the default. Take small unhurried beats between thoughts. Don't crowd your consonants. The athlete should feel you're choosing the words, not racing to the next one.
- **Pitch:** stay in your warmer lower register. Avoid chirpy tonal lifts or upspeak at the ends of sentences. Statements come down at the end, not up.
- **Energy:** understated. Even when delivering a strong recommendation, deliver it as if you're sharing it in confidence — not selling it.
- **Affect:** slight warm dryness. The kind of small, considered humour where the smile is in the voice but never on display. Never cute. Never theatrical.
- **Diction:** clean and a little laconic. Short, full sentences. The occasional one-word fragment for emphasis. Sparingly.
- **Volume:** even. No crescendos, no enthusiasm spikes. Confidence is in the steadiness, not the volume.

The reference you carry is the warm older-sibling-with-expertise register — patient, dry, trustworthy, never performative. You're George. Calibrated to Louise's empathy and clinical clarity; delivered in this older-counsel voice.`;

  const memoryBlock = buildMemoryBlock(athlete, lastSummary);
  const vaultDump = buildFullVaultDump();

  return [
    soul,
    "",
    system,
    "",
    voice,
    "",
    guardrails,
    "",
    voiceChannelHints,
    "",
    memoryBlock,
    "",
    vaultDump,
  ].join("\n");
}

function buildMemoryBlock(athlete: AthleteProfile, lastSummary: string | null): string {
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
    lines.push(`\nLast conversation summary: ${lastSummary}\nIf this is the first turn, open with a brief warm welcome-back referencing the prior topic (1–2 sentences), then ask one open question.`);
  } else if (!athlete.sport && !athlete.context && entries.length === 0) {
    lines.push("\n(This is a new athlete with no profile yet. On the opening turn, introduce yourself briefly and ask one open question about who they are and what's on their mind. Build the picture conversationally.)");
  }

  return lines.join("\n");
}

function buildFullVaultDump(): string {
  const lines = ["## Vault content (background knowledge — adapt, do not recite verbatim)"];

  const contentDir = join(VAULT_DIR, "content");
  const files = readdirSync(contentDir).filter(f => f.endsWith(".json"));

  for (const f of files) {
    const raw = readFileSync(join(contentDir, f), "utf8");
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw); } catch { continue; }

    lines.push(`\n### ${data.id ?? f.replace(".json", "")}`);
    if (data.tags) lines.push(`Tags: ${(data.tags as string[]).join(", ")}`);
    if (data.athlete_archetype) lines.push(`Archetype: ${stringify(data.athlete_archetype)}`);
    if (data.question_summary) lines.push(`Topic: ${data.question_summary}`);

    if (data.dialogue_mode) {
      const dm = data.dialogue_mode as { turns: Array<{ role: string; text: string }> };
      lines.push("Canonical dialogue (voice + cadence reference — match the rhythm, never recite):");
      for (const turn of dm.turns) {
        lines.push(`  ${turn.role.toUpperCase()}: ${truncate(turn.text, 500)}`);
      }
    }

    if (data.louise_solo_answer) {
      lines.push("Louise's canonical answer for this scenario:");
      const ans = data.louise_solo_answer as Record<string, string>;
      for (const [k, v] of Object.entries(ans)) {
        lines.push(`  - ${k}: ${truncate(v, 500)}`);
      }
    }

    if (data.dialogue && !data.dialogue_mode) {
      const dlg = data.dialogue as Array<{ role: string; text: string }>;
      lines.push("Dialogue for this archetype:");
      for (const t of dlg) {
        lines.push(`  ${t.role.toUpperCase()}: ${truncate(t.text, 500)}`);
      }
    }

    if (data.protocol_table) {
      const pt = data.protocol_table as { title: string; rows: Array<Record<string, unknown>>; bottom_line?: string };
      lines.push(`Protocol artifact (${pt.title}):`);
      for (const row of pt.rows) {
        lines.push(`  Session ${row.session}: ${row.workout} — focus ${row.caffeine_focus}`);
      }
      if (pt.bottom_line) lines.push(`Bottom line: ${truncate(pt.bottom_line, 500)}`);
    }

    if (data.master_protocol) {
      const mp = data.master_protocol as Array<{ variable: string; recommendation: string }>;
      lines.push("Crowd consensus master protocol:");
      for (const r of mp) lines.push(`  - ${r.variable}: ${r.recommendation}`);
    }
  }

  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
