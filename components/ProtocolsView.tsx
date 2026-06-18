"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAthleteId } from "@/lib/useAthleteId";
import { StatCard } from "./StatCard";

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
  const router = useRouter();
  const athleteId = useAthleteId();

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
        // Pre-populate sensible defaults from the athlete's sport
        const sport = (j.athlete?.sport ?? "").toLowerCase();
        if (sport.includes("ultra") || sport.includes("trail")) {
          setSupplement(curr => curr || "caffeine");
          setEvent(curr => curr || "100 km mountain ultra");
          setTarget(curr => curr || "sub-12 h");
        } else if (sport.includes("triathlon") || sport.includes("ironman")) {
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

  // If George just built a protocol in chat, landing on the N=1 page should pop
  // the trial straight open — auto-open the latest protocol once per browser
  // session (back-navigation still reaches the library afterwards).
  useEffect(() => {
    if (loading || !athleteId || protocols.length === 0) return;
    const newest = [...protocols].sort((a, b) => b.created_at - a.created_at)[0];
    const isFresh = Date.now() - newest.created_at < 2 * 60 * 60 * 1000; // 2h window
    const seenKey = `whatsupp.protocolAutoOpened.${newest.id}`;
    let seen = false;
    try { seen = sessionStorage.getItem(seenKey) === "1"; } catch { /* private mode */ }
    if (isFresh && !seen) {
      try { sessionStorage.setItem(seenKey, "1"); } catch { /* ignore */ }
      router.push(`/protocols/${newest.id}?a=${athleteId}`);
    }
  }, [loading, protocols, athleteId, router]);

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

  const latest = protocols.length > 0
    ? [...protocols].sort((a, b) => b.created_at - a.created_at)[0]
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1060px] mx-auto px-8 py-7">
        <header className="mb-6">
          <div className="eyebrow mb-2">N = 1 · Be a study of you</div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]" style={{ fontFamily: "var(--font-display)" }}>
            Self-test protocols{athlete?.name ? ` — ${athlete.name}` : ""}
          </h1>
          <p className="text-[13px] text-muted mt-1.5 max-w-2xl">
            Built like a clinical trial, felt like an app. George generates a structured block;
            you log each session as you complete it; George reads the patterns at the end.
          </p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-3.5">
          <StatCard
            label="Current trial"
            value={latest ? latest.supplement ?? "—" : "—"}
            sub={latest?.event ?? "No active protocol"}
          />
          <StatCard
            label="Sessions designed"
            value={latest?.data?.sessions?.length ?? "—"}
            sub={latest ? "In the active block" : "Build one below"}
          />
          <StatCard
            label="Protocols total"
            value={protocols.length}
            sub="All-time for this athlete"
            lime={protocols.length > 0}
          />
          <StatCard
            label="Panel sign-off"
            value="6/6"
            sub="Pre-registered checks"
            lime
          />
        </div>

        {/* Generator */}
        <section className="mb-3.5 panel px-6 py-5">
          <div className="hd mb-4">Build a new protocol</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Supplement">
              <input
                value={supplement}
                onChange={e => setSupplement(e.target.value)}
                placeholder="e.g., caffeine"
                className="field-dark w-full px-3 py-2 text-sm"
                disabled={generating}
              />
            </Field>
            <Field label="Event">
              <input
                value={event}
                onChange={e => setEvent(e.target.value)}
                placeholder="e.g., Kona Ironman"
                className="field-dark w-full px-3 py-2 text-sm"
                disabled={generating}
              />
            </Field>
            <Field label="Target (optional)">
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="e.g., 9 hours flat"
                className="field-dark w-full px-3 py-2 text-sm"
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
                className="field-dark w-full px-3 py-2 text-sm"
                disabled={generating}
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-[11px] text-text-4">
              George will design the block in your athlete profile&apos;s voice — workouts, focus per session, and what to log.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating || !supplement.trim() || !event.trim()}
              className="btn-primary px-5 py-2.5 rounded-lg text-sm shrink-0"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {generating ? "Generating…" : "Build protocol"}
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-3.5 text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-lg px-4 py-3 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-sm text-muted">Loading protocols…</div>
        ) : protocols.length === 0 ? (
          <div className="text-sm text-muted panel px-5 py-4">
            No protocols yet. Build one above, or ask George — he can suggest one based on what you&apos;re working on.
          </div>
        ) : (
          <section className="panel px-6 py-5">
            <div className="hd mb-2">Trial library</div>
            {protocols.map((p, i) => (
              <Link
                key={p.id}
                href={`/protocols/${p.id}?a=${athleteId}`}
                className={[
                  "flex items-center gap-4 py-3.5 group",
                  i > 0 ? "border-t border-line" : "",
                ].join(" ")}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13.5px] font-semibold text-foreground group-hover:text-lime transition-colors"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {p.data?.title ?? "Protocol"}
                  </div>
                  <div className="text-[11px] text-text-4 mt-0.5" style={{ fontFamily: "var(--font-mono-deck)" }}>
                    {p.supplement}{p.event ? ` · ${p.event}` : ""}{p.data?.sessions?.length ? ` · ${p.data.sessions.length} sessions` : ""}
                    {" · "}{new Date(p.created_at).toLocaleDateString()}
                  </div>
                  {p.data?.rationale && (
                    <p className="text-[12.5px] text-muted mt-1.5 line-clamp-2">{p.data.rationale}</p>
                  )}
                </div>
                <span className="ev-tag ev-strong">pre-registered</span>
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="hd block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
