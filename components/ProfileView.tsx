"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface Athlete {
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

export function ProfileView() {
  const searchParams = useSearchParams();
  const athleteId = searchParams.get("a");
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!athleteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setAthlete(j.athlete);
      }
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { load(); }, [load]);

  if (!athleteId) {
    return <div className="p-8 max-w-3xl mx-auto text-sm text-muted">Choose an athlete from the sidebar.</div>;
  }
  if (loading) return <div className="p-8 text-sm text-muted">Loading…</div>;
  if (!athlete) return <div className="p-8 text-sm text-muted">Athlete not found.</div>;

  const profile = athlete.profile ?? {};
  const profileEntries = Object.entries(profile).filter(([, v]) => v != null && v !== "");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">{athlete.name}</h1>
          <p className="text-sm text-muted mt-1">
            What George knows about this athlete. Profile facts are built conversationally — talk to George and they accumulate here.
          </p>
        </header>

        {/* Core facts */}
        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-wider text-muted mb-2">Core</h2>
          <div className="rounded-xl border border-border bg-surface divide-y divide-border">
            <Row label="Name" value={athlete.name} />
            <Row label="Sex" value={athlete.sex ?? "—"} />
            <Row label="Age" value={athlete.age != null ? String(athlete.age) : "—"} />
            <Row label="Weight" value={athlete.weight_kg != null ? `${athlete.weight_kg} kg` : "—"} />
            <Row label="Sport" value={athlete.sport ?? "—"} />
            <Row label="Level" value={athlete.level ?? "—"} />
          </div>
        </section>

        {/* Context */}
        {athlete.context && (
          <section className="mb-6">
            <h2 className="text-[11px] uppercase tracking-wider text-muted mb-2">Context</h2>
            <div className="rounded-xl border border-border bg-surface px-5 py-4 text-sm leading-relaxed text-foreground/90">
              {athlete.context}
            </div>
          </section>
        )}

        {/* Profile facts */}
        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-wider text-muted mb-2">Profile facts</h2>
          {profileEntries.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface px-5 py-4 text-sm text-muted">
              No profile facts yet. Start a conversation — George will gather context.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface divide-y divide-border">
              {profileEntries.map(([k, v]) => (
                <Row key={k} label={prettyKey(k)} value={typeof v === "string" ? v : JSON.stringify(v)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted self-center">{label}</div>
      <div className="text-sm text-foreground/90 leading-relaxed">{value}</div>
    </div>
  );
}

function prettyKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
