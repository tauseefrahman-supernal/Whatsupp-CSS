"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface GeneratedProtocol {
  title: string;
  rationale: string;
  sessions: Array<{ session: number; workout: string; focus: string; question: string }>;
  log_variables: string[];
  bottom_line: string;
}

interface ProtocolSummary {
  id: string;
  athlete_id: string;
  supplement: string | null;
  event: string | null;
  created_at: number;
  data: GeneratedProtocol;
}

interface Athlete {
  id: string;
  name: string;
  sport?: string | null;
  context?: string | null;
  profile?: Record<string, unknown>;
}

export function ProtocolsView() {
  const searchParams = useSearchParams();
  const athleteId = searchParams.get("a");

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [protocols, setProtocols] = useState<ProtocolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generator form
  const [supplement, setSupplement] = useState("");
  const [event, setEvent] = useState("");
  const [target, setTarget] = useState("");
  const [sessions, setSessions] = useState<number>(6);

  const load = useCallback(async () => {
    if (!athleteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [athleteRes, protocolsRes] = await Promise.all([
        fetch(`/api/athletes/${athleteId}`, { cache: "no-store" }),
        fetch(`/api/protocols?athleteId=${athleteId}`, { cache: "no-store" }),
      ]);
      if (athleteRes.ok) {
        const j = await athleteRes.json();
        setAthlete(j.athlete);
        // Pre-populate sensible defaults for Kona Tom
        const sport = (j.athlete?.sport ?? "").toLowerCase();
        if (sport.includes("triathlon") || sport.includes("ironman")) {
          setSupplement(curr => curr || "caffeine");
          setEvent(curr => curr || "Kona Ironman");
          setTarget(curr => curr || "~9 hours");
        } else if (sport.includes("aflw") || sport.includes("football")) {
          setSupplement(curr => curr || "caffeine");
          setEvent(curr => curr || "AFLW finals run");
        }
      }
      if (protocolsRes.ok) {
        const j = await protocolsRes.json();
        setProtocols(j.protocols ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    if (!athleteId || !supplement.trim() || !event.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          supplement: supplement.trim(),
          event: event.trim(),
          target: target.trim() || undefined,
          sessions,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.detail ?? j.error ?? `HTTP ${res.status}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  if (!athleteId) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-sm text-muted">
        Choose an athlete from the sidebar to build a self-test protocol.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">Self-test protocols</h1>
          <p className="text-sm text-muted mt-1">
            N-of-1 testing blocks for {athlete?.name ?? "this athlete"}. George generates a structured block; you log each session as you complete it; George reads the patterns at the end.
          </p>
        </header>

        {/* Generator */}
        <section className="mb-10 rounded-xl border border-border bg-surface px-6 py-5">
          <h2 className="text-sm font-semibold mb-3">Build a new protocol</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplement">
              <input
                value={supplement}
                onChange={e => setSupplement(e.target.value)}
                placeholder="e.g., caffeine"
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/15"
                disabled={generating}
              />
            </Field>
            <Field label="Event">
              <input
                value={event}
                onChange={e => setEvent(e.target.value)}
                placeholder="e.g., Kona Ironman"
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/15"
                disabled={generating}
              />
            </Field>
            <Field label="Target (optional)">
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="e.g., 9 hours flat"
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/15"
                disabled={generating}
              />
            </Field>
            <Field label="Sessions">
              <input
                type="number"
                value={sessions}
                onChange={e => setSessions(Number(e.target.value) || 6)}
                min={2}
                max={12}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/15"
                disabled={generating}
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px] text-muted">
              George will design the block in your athlete profile's voice — workouts, focus per session, and what to log.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating || !supplement.trim() || !event.trim()}
              className="px-4 py-2 rounded-md btn-primary text-sm font-medium"
            >
              {generating ? "Generating…" : "Build protocol"}
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-6 text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-md px-4 py-3 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-sm text-muted">Loading protocols…</div>
        ) : protocols.length === 0 ? (
          <div className="text-sm text-muted bg-surface/60 border border-border rounded-lg px-5 py-4">
            No protocols yet. Build one above, or ask George — he can suggest one based on what you're working on.
          </div>
        ) : (
          <div className="space-y-3">
            {protocols.map(p => (
              <Link
                key={p.id}
                href={`/protocols/${p.id}?a=${athleteId}`}
                className="block rounded-xl border border-border bg-surface px-5 py-4 hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="text-sm font-semibold">{p.data?.title ?? "Protocol"}</div>
                  <div className="text-[11px] text-muted">{new Date(p.created_at).toLocaleString()}</div>
                </div>
                <div className="text-xs text-muted">
                  {p.supplement}{p.event ? ` · ${p.event}` : ""}{p.data?.sessions?.length ? ` · ${p.data.sessions.length} sessions` : ""}
                </div>
                {p.data?.rationale && (
                  <p className="text-sm text-foreground/80 mt-2 line-clamp-2">{p.data.rationale}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
