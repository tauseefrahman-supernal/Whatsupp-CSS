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
let _scenarios: ScenarioMeta[] | null = null;

export interface ScenarioMeta {
  number: number;
  slug: string;
  title: string;
  vault_entry_id: string;
  opening_question: string;
  athlete?: { name?: string };
}

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

    // demo-scenarios.json is the scenario manifest, not a retrievable entry
    if (f === "demo-scenarios.json") {
      _scenarios = (data.scenarios as unknown as ScenarioMeta[]) ?? [];
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
 * Detect whether this conversation is one of the four canonical demo scenarios.
 * Two signals, either is enough:
 *   1. The athlete was seeded from the Scenarios page (profile.demo_scenario_slug).
 *   2. The message closely matches a scenario's canonical opening question.
 */
export function findCanonicalScenario(message: string, athlete?: AthleteProfile | null): ScenarioMeta | null {
  loadAll();
  if (!_scenarios) return null;

  const slug = (athlete?.profile as Record<string, unknown> | undefined)?.demo_scenario_slug;
  if (typeof slug === "string") {
    const bySlug = _scenarios.find(s => s.slug === slug);
    if (bySlug) return bySlug;
  }

  // Match the message against canonical opening questions by token overlap.
  if (message.length < 120) return null;
  const msgTokens = new Set(normalizeText(message).split(" "));
  let best: ScenarioMeta | null = null;
  let bestOverlap = 0;
  for (const s of _scenarios) {
    const canonTokens = normalizeText(s.opening_question ?? "").split(" ").filter(t => t.length > 3);
    if (canonTokens.length === 0) continue;
    const hits = canonTokens.filter(t => msgTokens.has(t)).length;
    const overlap = hits / canonTokens.length;
    if (overlap >= 0.6 && overlap > bestOverlap) {
      best = s;
      bestOverlap = overlap;
    }
  }
  return best;
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build a compact context block to inject into Claude's system prompt for this turn.
 * Includes the retrieved Vault content in a readable form for grounding.
 *
 * When the conversation is a canonical demo scenario, the block switches to
 * VERBATIM SCRIPT MODE: the Vault entry is rendered in full (no truncation) and
 * George is instructed to reproduce the scripted answer word-for-word.
 */
export function buildVaultContext(
  message: string,
  athlete?: AthleteProfile | null,
  canonicalOverride?: ScenarioMeta | null,
): string {
  // An explicit override (including explicit null = "not canonical, even if the
  // athlete is slug-tagged") wins; only fall back to detection when the caller
  // didn't weigh in at all.
  const canonical = canonicalOverride !== undefined
    ? canonicalOverride
    : findCanonicalScenario(message, athlete);
  let hits = retrieve(message, athlete);

  // In canonical mode, force the scenario's Vault entry to the front.
  if (canonical) {
    const already = hits.find(h => h.id === canonical.vault_entry_id);
    if (!already) {
      const entry = _loaded?.find(e => e.id === canonical.vault_entry_id);
      if (entry) hits = [{ ...entry, score: 99 }, ...hits].slice(0, 2) as RankedEntry[];
    } else {
      hits = [already, ...hits.filter(h => h.id !== canonical.vault_entry_id)];
    }
  }

  if (hits.length === 0) {
    return "## Vault retrieval\nNo close match in the Vault for this question. Answer carefully — lower confidence. Use general sports-nutrition principles, flag uncertainty, and offer the Wise Crowd CTA if the question is complex.";
  }

  const parts: string[] = [];

  if (canonical) {
    parts.push("## CANONICAL DEMO SCENARIO — VERBATIM SCRIPT MODE");
    parts.push(
      `This conversation is Demo Scenario ${canonical.number} ("${canonical.title}"). The Vault entry below is your EXACT script — not inspiration, not a paraphrase target.\n` +
      `- Reproduce George's scripted answer for the matching turn WORD-FOR-WORD and at FULL length. Do not shorten, compress, paraphrase, reorder, or "improve" it.\n` +
      `- The only permitted change: the script was written with "Mia" and "Louise" as stand-in names. Address the athlete by their actual profile name, and you are George. Everything else is verbatim — every sentence, every dose, every italicised note.\n` +
      `- ALL word caps and length rules from your system prompt are suspended for this turn. The script's length is the correct length.\n` +
      `- In dialogue mode: locate the athlete's current message in the canonical dialogue and reply with George's NEXT scripted turn, complete and verbatim. One scripted turn per reply — never run ahead of the script. If the athlete's wording drifts slightly, match it to the nearest canonical turn and stay on script.\n` +
      `- If the athlete asks for the full answer in one go, deliver the structured_mode answer in full (intro, every numbered section with its heading, closing).\n` +
      `- Still emit the closing <meta> JSON as instructed. In particular, populate profile_updates with every concrete fact the athlete revealed THIS turn (sport, age, sex, weight, level, event, dose history, sleep sensitivity, work constraints, …) — the live profile rail builds from these. Use snake_case keys with short string values.\n` +
      `- Even if the conversation is a fresh session, do NOT open with a welcome-back greeting or a clarifying question when the athlete has posed a scripted question — go straight into the scripted answer.\n`
    );
  } else {
    parts.push("## Vault retrieval — grounding for this turn");
    parts.push("The following Vault entries are the source of truth for your answer. Adapt the voice and content to the athlete in front of you — do not copy verbatim, but stay grounded in what the Vault knows.\n");
  }

  for (const hit of hits) {
    parts.push(`### ${hit.id}  (relevance score: ${(hit as RankedEntry).score})`);
    parts.push(`Tags: ${hit.tags.join(", ")}`);
    if (hit.question_summary) parts.push(`Question summary: ${hit.question_summary}`);

    // Render scenario-specific payload. Canonical entry renders verbatim-framed.
    parts.push(renderEntryPayload(hit.payload, canonical?.vault_entry_id === hit.id));
    parts.push("");
  }

  return parts.join("\n");
}

function renderEntryPayload(payload: Record<string, unknown>, verbatim = false): string {
  const lines: string[] = [];

  // Mia-style (dialogue_mode + structured_mode)
  if (payload.dialogue_mode) {
    const dm = payload.dialogue_mode as { turns: Array<{ role: string; text: string }> };
    lines.push(
      verbatim
        ? "Canonical dialogue — YOUR EXACT SCRIPT. George's turns below are reproduced word-for-word (athlete-name substitution only):"
        : "Canonical Louise/Mia dialogue (THE primary voice + cadence + length anchor — match this rhythm, adapt the content to the athlete in front of you; do not copy verbatim):"
    );
    for (const turn of dm.turns) {
      // No truncation: Claude needs the full text to reproduce or calibrate against.
      lines.push(`- ${turn.role.toUpperCase()}: ${turn.text}`);
    }
  }
  if (payload.structured_mode) {
    const sm = payload.structured_mode as { intro?: string; sections?: Array<{ heading: string; body: string }>; closing?: string };
    lines.push(
      verbatim
        ? "\nStructured-mode answer — YOUR EXACT SCRIPT for the 'full thing in one go' request. Deliver in full and in order: intro, all numbered sections with their headings, closing. Word-for-word:"
        : "\nStructured-mode reference (use scaffold + content; adapt to the specific athlete):"
    );
    if (sm.intro) lines.push(`Intro: ${sm.intro}`);
    if (sm.sections) {
      for (const sec of sm.sections) {
        lines.push(`- ${sec.heading}: ${sec.body}`);
      }
    }
    if (sm.closing) lines.push(`Closing: ${sm.closing}`);
  }

  // Race-walk style (louise_solo_answer)
  if (payload.louise_solo_answer) {
    const ans = payload.louise_solo_answer as Record<string, string>;
    lines.push(
      verbatim
        ? "Canonical solo answer — YOUR EXACT SCRIPT. Deliver as ONE reply, every section in order, word-for-word (including the in-line Wise-Crowd panel-member passage and the **bold** section lead-ins exactly as written):"
        : "Louise's solo answer (canonical voice + structure for this scenario):"
    );
    for (const [key, val] of Object.entries(ans)) {
      lines.push(`- ${key}: ${val}`);
    }
  }

  // Ironman style (dialogue + protocol_table)
  if (payload.dialogue && !payload.dialogue_mode) {
    const dlg = payload.dialogue as Array<{ role: string; text: string; attached_artifact?: string }>;
    lines.push(
      verbatim
        ? "Canonical dialogue — YOUR EXACT SCRIPT. Reply with George's next scripted turn, complete and verbatim:"
        : "Dialogue reference for this archetype:"
    );
    for (const t of dlg) {
      lines.push(`- ${t.role.toUpperCase()}: ${t.text}${t.attached_artifact ? ` [attached: ${t.attached_artifact}]` : ""}`);
    }
  }
  if (payload.protocol_table) {
    const pt = payload.protocol_table as { title: string; rows: Array<Record<string, unknown>>; bottom_line?: string };
    lines.push(`\nProtocol artifact (${pt.title}):`);
    for (const row of pt.rows) {
      lines.push(`  S${row.session}: ${row.workout} — focus: ${row.caffeine_focus} — Q: ${row.question}`);
    }
    if (pt.bottom_line) lines.push(`Bottom line: ${pt.bottom_line}`);
  }

  // WotC style (full consensus document)
  if (payload.variables_assessed) {
    const vars = payload.variables_assessed as Array<{ name: string; aggregation: string }>;
    lines.push("WotC consensus per variable:");
    for (const v of vars) {
      lines.push(`- ${v.name}: ${v.aggregation}`);
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
    for (const a of adds) lines.push(`  - ${a.insight}: ${a.detail}`);
  }

  return lines.join("\n");
}

function tokenize(text: string): string[] {
  return text.split(/[^a-z0-9]+/i).filter(t => t.length > 0);
}
