"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAthleteId } from "@/lib/useAthleteId";

interface ProtocolSession {
  session: number;
  workout: string;
  focus: string;
  question: string;
}

interface ProtocolData {
  title: string;
  rationale: string;
  sessions: ProtocolSession[];
  log_variables: string[];
  bottom_line: string;
}

interface ProtocolDetail {
  id: string;
  athlete_id: string;
  supplement: string | null;
  event: string | null;
  created_at: number;
  data: ProtocolData;
}

interface SessionLog {
  id: string;
  session_idx: number;
  data: Record<string, unknown> | null;
  log: string | null;
  created_at: number;
}

export function ProtocolDetailView({ protocolId }: { protocolId: string }) {
  const athleteId = useAthleteId();

  const [protocol, setProtocol] = useState<ProtocolDetail | null>(null);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarising, setSummarising] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/protocols/${protocolId}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      const j = await res.json();
      setProtocol(j.protocol);
      setLogs(j.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [protocolId]);

  useEffect(() => { load(); }, [load]);

  async function handleSummarise() {
    if (summarising) return;
    setSummarising(true);
    setError(null);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/summary`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.detail ?? j.error ?? `HTTP ${res.status}`);
        return;
      }
      const j = await res.json();
      setSummary(j.summary ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarising(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-muted">Loading protocol…</div>;
  if (error && !protocol) return <div className="p-8 text-sm text-confidence-low">{error}</div>;
  if (!protocol) return null;

  const data = protocol.data;
  const logsBySession = new Map<number, SessionLog[]>();
  for (const l of logs) {
    const arr = logsBySession.get(l.session_idx) ?? [];
    arr.push(l);
    logsBySession.set(l.session_idx, arr);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <Link href={`/protocols?a=${athleteId ?? ""}`} className="text-xs text-muted hover:text-foreground transition-colors">← All protocols</Link>

        <header className="mt-4 mb-6">
          <div className="eyebrow mb-2">N = 1 · Active protocol</div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]" style={{ fontFamily: "var(--font-display)" }}>{data.title}</h1>
          <p className="text-[11px] text-text-4 mt-1.5" style={{ fontFamily: "var(--font-mono-deck)" }}>
            {protocol.supplement}{protocol.event ? ` · ${protocol.event}` : ""}{" · "}{data.sessions.length} sessions
          </p>
          <p className="text-[13.5px] text-text-2 leading-relaxed mt-3 max-w-2xl">{data.rationale}</p>
        </header>

        {/* Sessions table */}
        <section className="mb-6">
          <div className="hd mb-3">Sessions</div>
          <div className="panel overflow-hidden">
            {data.sessions.map((s, i) => {
              const sessionLogs = logsBySession.get(s.session) ?? [];
              const completed = sessionLogs.length > 0;
              const isActive = activeSession === s.session;
              return (
                <div key={s.session} className={i > 0 ? "border-t border-border" : ""}>
                  <button
                    onClick={() => setActiveSession(isActive ? null : s.session)}
                    className="w-full text-left px-5 py-3.5 hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                          Session {s.session}
                          {completed && <span className="check-pill ok ml-2">logged ✓</span>}
                        </div>
                        <div className="text-xs text-muted">{s.workout} · {s.focus}</div>
                      </div>
                      <span className="text-muted">{isActive ? "▾" : "▸"}</span>
                    </div>
                    <div className="text-xs text-foreground/70 mt-1.5 italic">{s.question}</div>
                  </button>

                  {isActive && (
                    <SessionLogForm
                      protocolId={protocolId}
                      sessionIdx={s.session}
                      logVariables={data.log_variables}
                      existingLogs={sessionLogs}
                      onSaved={load}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom line */}
        <section className="mb-6 answer-block">
          <div className="k">Bottom line</div>
          <p className="text-[13px] text-foreground leading-relaxed">{data.bottom_line}</p>
        </section>

        {/* Summary */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <div className="hd">George reads the patterns</div>
            <button
              onClick={handleSummarise}
              disabled={summarising || logs.length === 0}
              className="btn-ghost px-3.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              title={logs.length === 0 ? "Log at least one session first" : "Summarise across all logged sessions"}
            >
              {summarising ? "Reading…" : "Summarise across sessions"}
            </button>
          </div>
          {summary ? (
            <div className="panel px-5 py-4">
              <p className="george-prose text-sm whitespace-pre-wrap">{summary}</p>
            </div>
          ) : (
            <p className="text-xs text-muted">
              {logs.length === 0
                ? "Log at least one session to enable the summary."
                : "Click 'Summarise across sessions' to have George read the patterns from your logs."}
            </p>
          )}
        </section>

        {error && (
          <div className="text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-md px-4 py-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionLogForm({
  protocolId,
  sessionIdx,
  logVariables,
  existingLogs,
  onSaved,
}: {
  protocolId: string;
  sessionIdx: number;
  logVariables: string[];
  existingLogs: SessionLog[];
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    if (!notes.trim() && Object.values(values).every(v => !v.trim())) {
      setError("Add notes or at least one variable before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) if (v.trim()) data[k] = v.trim();

      const res = await fetch(`/api/protocols/${protocolId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIdx,
          data: Object.keys(data).length > 0 ? data : undefined,
          log: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.detail ?? j.error ?? `HTTP ${res.status}`);
        return;
      }
      setNotes("");
      setValues({});
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-line bg-bg-3/40 px-5 py-4 space-y-4">
      {/* Existing logs */}
      {existingLogs.length > 0 && (
        <div className="space-y-2">
          <div className="hd">Logged</div>
          {existingLogs.map(l => (
            <div key={l.id} className="rounded-lg bg-bg-0/60 border border-line px-3 py-2">
              <div className="text-[10px] text-text-4 mb-1" style={{ fontFamily: "var(--font-mono-deck)" }}>{new Date(l.created_at).toLocaleString()}</div>
              {l.log && <p className="text-sm whitespace-pre-wrap mb-1.5">{l.log}</p>}
              {l.data && Object.keys(l.data).length > 0 && (
                <div className="text-[11px] text-muted">
                  {Object.entries(l.data).map(([k, v]) => (
                    <span key={k} className="mr-3"><span className="text-foreground/70">{k}:</span> {String(v)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New log form */}
      <div>
        <div className="hd mb-1.5">How it felt — notes</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Gut OK on the bike. Felt the caffeine kick in around 40 min — pacing felt more sustainable in the back third of the run. Sleep that night was solid 7h."
          rows={3}
          className="field-dark w-full px-3 py-2 text-sm"
          disabled={saving}
        />
      </div>

      <div>
        <div className="hd mb-1.5">Quick variables (optional)</div>
        <div className="grid grid-cols-2 gap-2">
          {logVariables.slice(0, 10).map(v => (
            <label key={v} className="flex items-center gap-2">
              <span className="text-[11px] text-muted shrink-0 w-32 truncate" title={v}>{v}</span>
              <input
                value={values[v] ?? ""}
                onChange={e => setValues(prev => ({ ...prev, [v]: e.target.value }))}
                className="field-dark flex-1 min-w-0 px-2 py-1 text-[12px]"
                disabled={saving}
              />
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-xs text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-md btn-primary text-sm font-medium"
        >
          {saving ? "Saving…" : "Log this session"}
        </button>
      </div>
    </div>
  );
}
