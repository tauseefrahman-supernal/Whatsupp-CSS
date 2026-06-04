"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface SessionRow {
  id: string;
  athlete_id: string;
  topic: string | null;
  summary: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta_json: string | null;
  created_at: number;
}

interface Athlete {
  id: string;
  name: string;
  sport?: string | null;
}

export function HistoryView() {
  const searchParams = useSearchParams();
  const athleteId = searchParams.get("a");

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [messagesByMostRecent, setMessagesByMostRecent] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!athleteId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setAthlete(j.athlete);
        setSessions(j.sessions ?? []);
        setMessagesByMostRecent(j.recentMessages ?? []);
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

  const mostRecent = sessions[0];
  const prior = sessions.slice(1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">History</h1>
          <p className="text-sm text-muted mt-1">
            Conversations with George — most recent first. Summaries are generated when you start a new conversation so George remembers next time.
          </p>
        </header>

        {sessions.length === 0 && (
          <div className="rounded-xl border border-border bg-surface px-5 py-4 text-sm text-muted">
            No conversations yet. Open George and start chatting.
          </div>
        )}

        {/* Most recent (active) */}
        {mostRecent && (
          <section className="mb-8">
            <h2 className="text-[11px] uppercase tracking-wider text-muted mb-2">Active conversation</h2>
            <div className="rounded-xl border border-border bg-surface px-5 py-4">
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-sm font-semibold">{mostRecent.topic ?? "Current conversation"}</div>
                <div className="text-[10px] text-muted">{new Date(mostRecent.updated_at).toLocaleString()}</div>
              </div>
              {mostRecent.summary && (
                <p className="text-sm text-foreground/85 leading-relaxed mb-3">{mostRecent.summary}</p>
              )}
              <div className="space-y-3 mt-3 pt-3 border-t border-border">
                {messagesByMostRecent.length === 0 && (
                  <div className="text-xs text-muted">No messages yet.</div>
                )}
                {messagesByMostRecent.slice(-6).map(m => (
                  <div key={m.id}>
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">
                      {m.role === "user" ? (athlete?.name ?? "You") : "George"}
                    </div>
                    <div className="text-sm text-foreground/90 leading-relaxed line-clamp-3 whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
                {messagesByMostRecent.length > 6 && (
                  <div className="text-[11px] text-muted">…and {messagesByMostRecent.length - 6} earlier messages.</div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Prior sessions */}
        {prior.length > 0 && (
          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-muted mb-2">Earlier</h2>
            <div className="space-y-2">
              {prior.map(s => (
                <div key={s.id} className="rounded-xl border border-border bg-surface px-5 py-4">
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="text-sm font-semibold">{s.topic ?? "Conversation"}</div>
                    <div className="text-[10px] text-muted">{new Date(s.updated_at).toLocaleDateString()}</div>
                  </div>
                  {s.summary ? (
                    <p className="text-sm text-foreground/80 leading-relaxed">{s.summary}</p>
                  ) : (
                    <p className="text-sm text-muted italic">No summary yet — start a new conversation to summarise this one.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
