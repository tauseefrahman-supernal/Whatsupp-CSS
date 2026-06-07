"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAthleteId } from "@/lib/useAthleteId";

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
  const athleteId = useAthleteId();

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
          <div className="eyebrow mb-2">Conversations</div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]" style={{ fontFamily: "var(--font-display)" }}>History</h1>
          <p className="text-[13px] text-muted mt-1.5">
            Conversations with George — most recent first. Open any conversation to jump back into the full chat;
            click a name to rename it.
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
            <h2 className="hd mb-2">Active conversation</h2>
            <div className="rounded-xl border border-border bg-surface px-5 py-4 hover:border-line-strong transition-colors">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <SessionTitle session={mostRecent} fallback="Current conversation" onRenamed={load} />
                <div className="text-[10px] text-muted shrink-0">{new Date(mostRecent.updated_at).toLocaleString()}</div>
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
                    <div className="hd mb-0.5">
                      {m.role === "user" ? (athlete?.name ?? "You") : "George"}
                    </div>
                    <div className="text-sm text-foreground/90 leading-relaxed line-clamp-3 whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
                {messagesByMostRecent.length > 6 && (
                  <div className="text-[11px] text-muted">…and {messagesByMostRecent.length - 6} earlier messages.</div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex justify-end">
                <Link href={`/george?a=${athleteId}&s=${mostRecent.id}`} className="action-chip">
                  Continue this chat →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Prior sessions */}
        {prior.length > 0 && (
          <section>
            <h2 className="hd mb-2">Earlier</h2>
            <div className="space-y-2">
              {prior.map(s => (
                <div key={s.id} className="rounded-xl border border-border bg-surface px-5 py-4 hover:border-line-strong transition-colors">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <SessionTitle session={s} fallback="Conversation" onRenamed={load} />
                    <div className="text-[10px] text-muted shrink-0">{new Date(s.updated_at).toLocaleDateString()}</div>
                  </div>
                  {s.summary ? (
                    <p className="text-sm text-foreground/80 leading-relaxed">{s.summary}</p>
                  ) : (
                    <p className="text-sm text-muted italic">No summary yet — start a new conversation to summarise this one.</p>
                  )}
                  <div className="mt-3 flex justify-end">
                    <Link href={`/george?a=${athleteId}&s=${s.id}`} className="action-chip">
                      Open this chat →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Conversation title — click to rename in place (Enter saves, Esc cancels). */
function SessionTitle({
  session,
  fallback,
  onRenamed,
}: {
  session: SessionRow;
  fallback: string;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.topic ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const topic = draft.trim();
    if (!topic || topic === session.topic) { setEditing(false); return; }
    setSaving(true);
    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      onRenamed();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        disabled={saving}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setEditing(false); setDraft(session.topic ?? ""); }
        }}
        onBlur={save}
        placeholder="Name this conversation…"
        className="field-dark flex-1 min-w-0 px-2 py-1 text-sm font-semibold"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(session.topic ?? ""); setEditing(true); }}
      className="text-left text-sm font-semibold text-foreground hover:text-lime transition-colors min-w-0 truncate"
      title="Rename this conversation"
    >
      {session.topic ?? fallback}
      <span className="ml-1.5 text-[10px] text-muted align-middle">✎</span>
    </button>
  );
}
