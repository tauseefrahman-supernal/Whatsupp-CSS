import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AthleteProfile } from "@/lib/db";

const VAULT_DIR = join(process.cwd(), "lib", "vault");

interface VaultEntry {
  id: string;
  scenarios?: number[];
  tags: string[];
  supplement_categories?: string[];
  sport?: string;
  question_summary?: string;
  athlete_archetype?: Record<string, unknown>;
  // Raw content payload (varies per entry shape)
  payload: Record<string, unknown>;
}

interface RankedEntry extends VaultEntry {
  score: number;
}

let _loaded: VaultEntry[] | null = null;
let _soul: string | null = null;
let _system: string | null = null;
let _voice: string | null = null;
let _guardrails: string | null = null;
let _experts: Record<string, unknown>[] | null = null;

function loadAll() {
  // In dev, always re-read prompts + Vault so edits hot-reload without restarting the server.
  if (_loaded && process.env.NODE_ENV !== "development") return;
  if (process.env.NODE_ENV === "development") _loaded = null;

  const contentDir = join(VAULT_DIR, "content");
  const files = readdirSync(contentDir).filter(f => f.endsWith(".json"));
  const entries: VaultEntry[] = [];

  for (const f of files) {
    const raw = readFileSync(join(contentDir, f), "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;

    // experts.json has different shape — treat it specially
    if (f === "experts.json") {
      _experts = (data.panel as Record<string, unknown>[]) ?? [];
      continue;
    }

    entries.push({
      id: (data.id as string) ?? f.replace(".json", ""),
      scenarios: (data.scenarios as number[]) ?? [],
      tags: (data.tags as string[]) ?? [],
      supplement_categories: (data.supplement_categories as string[]) ?? [],
      sport: ((data.athlete_archetype as Record<string, string>)?.sport) ?? "",
      question_summary: (data.question_summary as string) ?? "",
      athlete_archetype: (data.athlete_archetype as Record<string, unknown>) ?? {},
      payload: data,
    });
  }

  _loaded = entries;
  _soul = readFileSync(join(VAULT_DIR, "prompts", "soul.md"), "utf8");
  _system = readFileSync(join(VAULT_DIR, "prompts", "george-system.md"), "utf8");
  _voice = readFileSync(join(VAULT_DIR, "style", "louise-voice.md"), "utf8");
  _guardrails = readFileSync(join(VAULT_DIR, "values", "guardrails.md"), "utf8");
}

export function getPrompts() {
  loadAll();
  return {
    soul: _soul!,
    system: _system!,
    voice: _voice!,
    guardrails: _guardrails!,
  };
}

export function getExperts() {
  loadAll();
  return _experts ?? [];
}

/**
 * Tag-and-sport retrieval. For 4-scenario prototype, simple keyword overlap is enough.
 * Returns the top entries by score, with score > 0.
 */
export function retrieve(message: string, athlete?: AthleteProfile | null, limit = 2): VaultEntry[] {
  loadAll();
  if (!_loaded) return [];

  const lower = message.toLowerCase();
  const tokens = tokenize(lower);
  const athleteSport = athlete?.sport?.toLowerCase() ?? "";
  const athleteSportFirstWord = athleteSport.split(/[\s(]+/)[0] ?? "";

  const ranked: RankedEntry[] = [];

  for (const entry of _loaded) {
    let score = 0;

    // Tag matches
    for (const tag of entry.tags ?? []) {
      const tagLower = tag.toLowerCase();
      const tagNormal = tagLower.replace(/-/g, " ");
      if (lower.includes(tagLower) || lower.includes(tagNormal)) score += 3;
      // Token-level
      for (const tok of tokens) {
        if (tagLower === tok || tagNormal === tok) score += 1;
      }
    }

    // Supplement category mentions
    for (const cat of entry.supplement_categories ?? []) {
      const catLower = cat.toLowerCase();
      if (lower.includes(catLower) || lower.includes(catLower.replace(/-/g, " "))) score += 4;
    }

    // Sport match (athlete profile)
    const entrySport = (entry.sport ?? "").toLowerCase();
    if (entrySport && athleteSportFirstWord) {
      if (entrySport.includes(athleteSportFirstWord) || athleteSport.includes((entrySport.split(/[\s(]+/)[0] ?? ""))) {
        score += 5;
      }
    }

    // Question-summary keyword overlap
    const summary = (entry.question_summary ?? "").toLowerCase();
    for (const tok of tokens) {
      if (tok.length > 4 && summary.includes(tok)) score += 1;
    }

    if (score > 0) ranked.push({ ...entry, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

/**
 * Build a compact context block to inject into Claude's system prompt for this turn.
 * Includes the retrieved Vault content in a readable form for grounding.
 */
export function buildVaultContext(message: string, athlete?: AthleteProfile | null): string {
  const hits = retrieve(message, athlete);
  if (hits.length === 0) {
    return "## Vault retrieval\nNo close match in the Vault for this question. Answer carefully — lower confidence. Use general sports-nutrition principles, flag uncertainty, and offer the Wise Crowd CTA if the question is complex.";
  }

  const parts: string[] = ["## Vault retrieval — grounding for this turn"];
  parts.push("The following Vault entries are the source of truth for your answer. Adapt the voice and content to the athlete in front of you — do not copy verbatim, but stay grounded in what the Vault knows.\n");

  for (const hit of hits) {
    parts.push(`### ${hit.id}  (relevance score: ${(hit as RankedEntry).score})`);
    parts.push(`Tags: ${hit.tags.join(", ")}`);
    if (hit.question_summary) parts.push(`Question summary: ${hit.question_summary}`);

    // Render scenario-specific payload
    parts.push(renderEntryPayload(hit.payload));
    parts.push("");
  }

  return parts.join("\n");
}

function renderEntryPayload(payload: Record<string, unknown>): string {
  const lines: string[] = [];

  // Mia-style (dialogue_mode + structured_mode)
  if (payload.dialogue_mode) {
    const dm = payload.dialogue_mode as { turns: Array<{ role: string; text: string }> };
    lines.push("Canonical Louise/Mia dialogue (THE primary voice + cadence + length anchor — match this rhythm, adapt the content to the athlete in front of you; do not copy verbatim):");
    for (const turn of dm.turns) {
      // No truncation: Claude needs to see the full Louise cadence to calibrate length.
      lines.push(`- ${turn.role.toUpperCase()}: ${turn.text}`);
    }
  }
  if (payload.structured_mode) {
    const sm = payload.structured_mode as { intro?: string; sections?: Array<{ heading: string; body: string }>; closing?: string };
    lines.push("\nStructured-mode reference (use scaffold + content; adapt to the specific athlete):");
    if (sm.intro) lines.push(`Intro: ${truncate(sm.intro, 600)}`);
    if (sm.sections) {
      for (const sec of sm.sections) {
        lines.push(`- ${sec.heading}: ${truncate(sec.body, 400)}`);
      }
    }
    if (sm.closing) lines.push(`Closing: ${truncate(sm.closing, 400)}`);
  }

  // Race-walk style (louise_solo_answer)
  if (payload.louise_solo_answer) {
    const ans = payload.louise_solo_answer as Record<string, string>;
    lines.push("Louise's solo answer (canonical voice + structure for this scenario):");
    for (const [key, val] of Object.entries(ans)) {
      lines.push(`- ${key}: ${truncate(val, 600)}`);
    }
  }

  // Ironman style (dialogue + protocol_table)
  if (payload.dialogue && !payload.dialogue_mode) {
    const dlg = payload.dialogue as Array<{ role: string; text: string; attached_artifact?: string }>;
    lines.push("Dialogue reference for this archetype:");
    for (const t of dlg) {
      lines.push(`- ${t.role.toUpperCase()}: ${truncate(t.text, 600)}${t.attached_artifact ? ` [attached: ${t.attached_artifact}]` : ""}`);
    }
  }
  if (payload.protocol_table) {
    const pt = payload.protocol_table as { title: string; rows: Array<Record<string, unknown>>; bottom_line?: string };
    lines.push(`\nProtocol artifact (${pt.title}):`);
    for (const row of pt.rows) {
      lines.push(`  S${row.session}: ${row.workout} — focus: ${row.caffeine_focus} — Q: ${row.question}`);
    }
    if (pt.bottom_line) lines.push(`Bottom line: ${truncate(pt.bottom_line, 800)}`);
  }

  // WotC style (full consensus document)
  if (payload.variables_assessed) {
    const vars = payload.variables_assessed as Array<{ name: string; aggregation: string }>;
    lines.push("WotC consensus per variable:");
    for (const v of vars) {
      lines.push(`- ${v.name}: ${truncate(v.aggregation, 500)}`);
    }
  }
  if (payload.master_protocol) {
    const mp = payload.master_protocol as Array<{ variable: string; recommendation: string }>;
    lines.push("\nMaster protocol:");
    for (const row of mp) lines.push(`  - ${row.variable}: ${row.recommendation}`);
  }
  if (payload.what_the_crowd_adds_beyond_solo) {
    const adds = payload.what_the_crowd_adds_beyond_solo as Array<{ insight: string; detail: string }>;
    lines.push("\nWhat the crowd adds beyond a solo expert:");
    for (const a of adds) lines.push(`  - ${a.insight}: ${truncate(a.detail, 400)}`);
  }

  return lines.join("\n");
}

function tokenize(text: string): string[] {
  return text.split(/[^a-z0-9]+/i).filter(t => t.length > 0);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}
