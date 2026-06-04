import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/whatsupp.db";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  migrate(_db);
  seed(_db);

  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS athletes (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      sex          TEXT,
      age          INTEGER,
      weight_kg    REAL,
      sport        TEXT,
      level        TEXT,
      context      TEXT,
      profile_json TEXT,
      seeded       INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      athlete_id  TEXT NOT NULL,
      topic       TEXT,
      summary     TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS sessions_athlete_idx ON sessions(athlete_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      meta_json   TEXT,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id, created_at);

    CREATE TABLE IF NOT EXISTS protocols (
      id          TEXT PRIMARY KEY,
      athlete_id  TEXT NOT NULL,
      supplement  TEXT,
      event       TEXT,
      data_json   TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS protocol_sessions (
      id           TEXT PRIMARY KEY,
      protocol_id  TEXT NOT NULL,
      session_idx  INTEGER NOT NULL,
      data_json    TEXT,
      log          TEXT,
      created_at   INTEGER NOT NULL,
      FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE
    );
  `);
}

function seed(db: Database.Database) {
  const existing = db.prepare("SELECT COUNT(*) as n FROM athletes WHERE seeded = 1").get() as { n: number };
  if (existing.n > 0) return;

  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO athletes (id, name, sex, age, weight_kg, sport, level, context, profile_json, seeded, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  insert.run(
    "mia-aflw",
    "Mia",
    "F",
    28,
    null,
    "AFLW (Australian rules football, women's)",
    "Professional, with a demanding day job",
    "Currently in finals run. Anxious before night semi-final. Building toward Grand Final.",
    JSON.stringify({
      caffeine_history: "5 No-Doz pre-match like male players (~500 mg, ~6–7 mg/kg)",
      sleep_sensitivity: "Cannot have coffee after 4pm without lying awake",
      side_effects_observed: "Wired in first quarter, can't wind down post-match, exhausted but can't sleep",
      work_constraint: "Demanding day job, can't be wrecked for 3–4 days post-match",
      next_event: "Semi-final tonight; targeting Grand Final",
      typical_caffeine_use: "Coffee in mornings only, sensitive to afternoon caffeine",
    }),
    now,
    now,
  );

  insert.run(
    "kona-tom",
    "Tom",
    "M",
    40,
    75,
    "Triathlon — 70.3 and full Ironman",
    "Competitive amateur, 4 years racing, 16–20 hr/week training",
    "Targeting Kona ~9 hours flat. Wants detail and is open to N-of-1 testing in brick workouts.",
    JSON.stringify({
      training_volume_hours_per_week: "16–20",
      target_event: "Kona Ironman",
      target_time: "~9:00 flat",
      experience_years: 4,
      weight_kg: 75,
      curiosity: "Wants distributed caffeine across race, suspects 6–8 mg/kg total",
      data_sources_available: ["Garmin", "Strava", "TrainingPeaks"],
    }),
    now,
    now,
  );
}

// ---- Type-safe row interfaces ----

export interface AthleteRow {
  id: string;
  name: string;
  sex: string | null;
  age: number | null;
  weight_kg: number | null;
  sport: string | null;
  level: string | null;
  context: string | null;
  profile_json: string | null;
  seeded: number;
  created_at: number;
  updated_at: number;
}

export interface AthleteProfile {
  id: string;
  name: string;
  sex?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  sport?: string | null;
  level?: string | null;
  context?: string | null;
  profile?: Record<string, unknown>;
}

export interface SessionRow {
  id: string;
  athlete_id: string;
  topic: string | null;
  summary: string | null;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta_json: string | null;
  created_at: number;
}

// ---- Athlete operations ----

export function listAthletes(): AthleteProfile[] {
  const rows = getDb().prepare("SELECT * FROM athletes ORDER BY seeded DESC, updated_at DESC").all() as AthleteRow[];
  return rows.map(rowToAthlete);
}

export function getAthlete(id: string): AthleteProfile | null {
  const row = getDb().prepare("SELECT * FROM athletes WHERE id = ?").get(id) as AthleteRow | undefined;
  return row ? rowToAthlete(row) : null;
}

export function createAthlete(name: string): AthleteProfile {
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO athletes (id, name, sex, age, weight_kg, sport, level, context, profile_json, seeded, created_at, updated_at)
    VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, '{}', 0, ?, ?)
  `).run(id, name, now, now);
  return getAthlete(id)!;
}

export function updateAthleteProfile(id: string, patch: Partial<AthleteProfile>): AthleteProfile | null {
  const existing = getAthlete(id);
  if (!existing) return null;

  const mergedProfile = { ...(existing.profile ?? {}), ...(patch.profile ?? {}) };
  const next = {
    name: patch.name ?? existing.name,
    sex: patch.sex ?? existing.sex ?? null,
    age: patch.age ?? existing.age ?? null,
    weight_kg: patch.weight_kg ?? existing.weight_kg ?? null,
    sport: patch.sport ?? existing.sport ?? null,
    level: patch.level ?? existing.level ?? null,
    context: patch.context ?? existing.context ?? null,
    profile_json: JSON.stringify(mergedProfile),
    updated_at: Date.now(),
  };

  getDb().prepare(`
    UPDATE athletes
    SET name = ?, sex = ?, age = ?, weight_kg = ?, sport = ?, level = ?, context = ?, profile_json = ?, updated_at = ?
    WHERE id = ?
  `).run(next.name, next.sex, next.age, next.weight_kg, next.sport, next.level, next.context, next.profile_json, next.updated_at, id);

  return getAthlete(id);
}

function rowToAthlete(row: AthleteRow): AthleteProfile {
  let profile: Record<string, unknown> = {};
  if (row.profile_json) {
    try { profile = JSON.parse(row.profile_json); } catch { /* ignore */ }
  }
  return {
    id: row.id,
    name: row.name,
    sex: row.sex,
    age: row.age,
    weight_kg: row.weight_kg,
    sport: row.sport,
    level: row.level,
    context: row.context,
    profile,
  };
}

// ---- Session + message operations ----

export function getOrCreateSession(athleteId: string): SessionRow {
  const recent = getDb().prepare(
    "SELECT * FROM sessions WHERE athlete_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).get(athleteId) as SessionRow | undefined;

  // Reuse the most recent session by default. Explicit "+ New conversation" calls
  // createNewSession() to start a fresh one.
  if (recent) return recent;
  return createNewSession(athleteId);
}

export function createNewSession(athleteId: string): SessionRow {
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO sessions (id, athlete_id, topic, summary, created_at, updated_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
  `).run(id, athleteId, now, now);
  return getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow;
}

/** Most recent session for this athlete that is NOT the given session, if any. */
export function getPriorSession(athleteId: string, excludeSessionId: string): SessionRow | null {
  const row = getDb().prepare(`
    SELECT * FROM sessions
    WHERE athlete_id = ? AND id != ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(athleteId, excludeSessionId) as SessionRow | undefined;
  return row ?? null;
}

export function listSessions(athleteId: string): SessionRow[] {
  return getDb().prepare(
    "SELECT * FROM sessions WHERE athlete_id = ? ORDER BY updated_at DESC"
  ).all(athleteId) as SessionRow[];
}

export function appendMessage(sessionId: string, role: MessageRow["role"], content: string, meta?: Record<string, unknown>): MessageRow {
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO messages (id, session_id, role, content, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, role, content, meta ? JSON.stringify(meta) : null, now);

  getDb().prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now, sessionId);

  return getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
}

export function listMessages(sessionId: string): MessageRow[] {
  return getDb().prepare(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC"
  ).all(sessionId) as MessageRow[];
}

export function updateSessionSummary(sessionId: string, topic: string, summary: string) {
  getDb().prepare("UPDATE sessions SET topic = ?, summary = ?, updated_at = ? WHERE id = ?")
    .run(topic, summary, Date.now(), sessionId);
}

// ---- Protocol operations ----

export interface ProtocolRow {
  id: string;
  athlete_id: string;
  supplement: string | null;
  event: string | null;
  data_json: string;
  created_at: number;
}

export interface ProtocolSessionLogRow {
  id: string;
  protocol_id: string;
  session_idx: number;
  data_json: string | null;
  log: string | null;
  created_at: number;
}

export interface GeneratedProtocol {
  title: string;
  rationale: string;
  sessions: Array<{
    session: number;
    workout: string;
    focus: string;
    question: string;
  }>;
  log_variables: string[];
  bottom_line: string;
}

export function createProtocol(
  athleteId: string,
  supplement: string | null,
  event: string | null,
  data: GeneratedProtocol,
): ProtocolRow {
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO protocols (id, athlete_id, supplement, event, data_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, athleteId, supplement, event, JSON.stringify(data), now);
  return getDb().prepare("SELECT * FROM protocols WHERE id = ?").get(id) as ProtocolRow;
}

export function listProtocols(athleteId: string): ProtocolRow[] {
  return getDb().prepare(
    "SELECT * FROM protocols WHERE athlete_id = ? ORDER BY created_at DESC"
  ).all(athleteId) as ProtocolRow[];
}

export function getProtocol(id: string): ProtocolRow | null {
  const row = getDb().prepare("SELECT * FROM protocols WHERE id = ?").get(id) as ProtocolRow | undefined;
  return row ?? null;
}

export function listProtocolSessionLogs(protocolId: string): ProtocolSessionLogRow[] {
  return getDb().prepare(
    "SELECT * FROM protocol_sessions WHERE protocol_id = ? ORDER BY session_idx ASC, created_at DESC"
  ).all(protocolId) as ProtocolSessionLogRow[];
}

export function logProtocolSession(
  protocolId: string,
  sessionIdx: number,
  data: Record<string, unknown> | null,
  log: string | null,
): ProtocolSessionLogRow {
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO protocol_sessions (id, protocol_id, session_idx, data_json, log, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, protocolId, sessionIdx, data ? JSON.stringify(data) : null, log, now);
  return getDb().prepare("SELECT * FROM protocol_sessions WHERE id = ?").get(id) as ProtocolSessionLogRow;
}
