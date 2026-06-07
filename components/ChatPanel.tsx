"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { ComparePanel, type CompareEntry } from "./ComparePanel";
import { VoiceMode } from "./VoiceMode";
import { ContextRail } from "./ContextRail";
import { useAthleteId } from "@/lib/useAthleteId";

interface AthleteSummary {
  id: string;
  name: string;
  sport?: string | null;
  level?: string | null;
  context?: string | null;
  profile?: Record<string, unknown>;
}

export function ChatPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const athleteId = useAthleteId();
  const sessionId = searchParams.get("s"); // a specific conversation from History
  const prefill = searchParams.get("prefill");
  const seedSlug = searchParams.get("seed");

  const [athlete, setAthlete] = useState<AthleteSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareEntries, setCompareEntries] = useState<CompareEntry[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareFocusId, setCompareFocusId] = useState<string | null>(null);
  const [newSessionLoading, setNewSessionLoading] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Persist compare history per-athlete so the demo log survives panel close & reloads.
  const compareStorageKey = athleteId ? `whatsupp.compareHistory.${athleteId}` : null;
  useEffect(() => {
    if (!compareStorageKey) { setCompareEntries([]); return; }
    try {
      const raw = localStorage.getItem(compareStorageKey);
      if (!raw) { setCompareEntries([]); return; }
      const parsed = JSON.parse(raw) as CompareEntry[];
      // Anything left "loading" from a previous tab close → mark error so it doesn't spin forever.
      setCompareEntries(parsed.map(e => e.status === "loading" ? { ...e, status: "error", error: "Interrupted" } : e));
    } catch {
      setCompareEntries([]);
    }
  }, [compareStorageKey]);
  useEffect(() => {
    if (!compareStorageKey) return;
    try { localStorage.setItem(compareStorageKey, JSON.stringify(compareEntries)); } catch {}
  }, [compareStorageKey, compareEntries]);

  // Pre-fill the composer with a scenario's canonical opening question
  // (only on the initial mount of a given prefill value).
  const prefilledRef = useRef<string | null>(null);
  useEffect(() => {
    if (prefill && prefilledRef.current !== prefill) {
      setInput(prefill);
      prefilledRef.current = prefill;
      // Strip the prefill query param so refreshing doesn't re-fill.
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("prefill");
      router.replace(`/george?${sp.toString()}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);
  // Mark unused to satisfy lints when seedSlug is read elsewhere/by future code.
  void seedSlug;

  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep a ref to the latest messages so callbacks can read them without triggering
  // setState-in-render (which happens if you call state setters from inside a setMessages updater).
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const findPrecedingUserQuestion = useCallback((assistantId: string): string | null => {
    const msgs = messagesRef.current;
    const idx = msgs.findIndex(m => m.id === assistantId);
    if (idx < 0) return null;
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === "user") return msgs[i].content;
    }
    return null;
  }, []);

  // Find the user question that prompted a given assistant message, then open the compare
  // panel. If we've already compared this assistant turn, just re-open and scroll to it.
  // Otherwise create a loading entry, open the panel, and fetch in the background — the fetch
  // continues even if the panel is closed, so the result lands in the running log.
  const startCompare = useCallback((assistantId: string) => {
    const question = findPrecedingUserQuestion(assistantId);
    if (!question) return;

    setCompareEntries(curr => {
      const existing = curr.find(e => e.assistantId === assistantId);
      if (existing) {
        setCompareFocusId(existing.id);
        setCompareOpen(true);
        return curr;
      }

      const entryId = `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newEntry: CompareEntry = {
        id: entryId,
        assistantId,
        question,
        askedAt: Date.now(),
        status: "loading",
      };
      setCompareFocusId(entryId);
      setCompareOpen(true);

      // Fetch in background; result lands in entries regardless of panel state.
      fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })
        .then(r => r.json().then(j => ({ ok: r.ok, body: j })))
        .then(({ ok, body }) => {
          setCompareEntries(es => es.map(e => {
            if (e.id !== entryId) return e;
            if (!ok) return { ...e, status: "error", error: body?.error ?? "Compare failed" };
            return {
              ...e,
              status: "ok",
              gpt: body.gpt,
              claude: body.claude,
              models: body.models,
            };
          }));
        })
        .catch(err => {
          setCompareEntries(es => es.map(e =>
            e.id === entryId ? { ...e, status: "error", error: err instanceof Error ? err.message : String(err) } : e,
          ));
        });

      return [...curr, newEntry];
    });
  }, [findPrecedingUserQuestion]);

  // Wise Crowd CTA → deep-link to /wotc with the user question pre-filled and
  // the crowd auto-convened, so the escalation lands mid-deliberation.
  const openWiseCrowd = useCallback((assistantId: string) => {
    const question = findPrecedingUserQuestion(assistantId);
    if (!question) return;
    const params = new URLSearchParams();
    if (athleteId) params.set("a", athleteId);
    params.set("q", question);
    params.set("auto", "1");
    router.push(`/wotc?${params.toString()}`);
  }, [router, athleteId, findPrecedingUserQuestion]);

  // Load athlete + history whenever athleteId (or the targeted session) changes.
  // With ?s=<sessionId> (deep link from History) the full stored conversation is
  // loaded; otherwise the athlete's most recent session.
  const loadAthlete = useCallback(async (id: string, sid?: string | null) => {
    setError(null);
    setMessages([]);
    setAthlete(null);
    try {
      const res = await fetch(`/api/athletes/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setError(`Could not load athlete (${res.status}).`);
        return;
      }
      const data = await res.json();
      setAthlete(data.athlete);

      type StoredMessage = {
        id: string;
        role: "user" | "assistant" | "system";
        content: string;
        meta_json?: string | null;
        created_at: number;
      };
      let recent = (data.recentMessages ?? []) as StoredMessage[];

      if (sid) {
        const sres = await fetch(`/api/sessions/${sid}`, { cache: "no-store" });
        if (sres.ok) {
          const sj = await sres.json();
          if (sj.session?.athlete_id === id) recent = (sj.messages ?? []) as StoredMessage[];
        }
      }

      setMessages(
        recent
          .filter(m => m.role === "user" || m.role === "assistant")
          .map(m => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            meta: m.meta_json ? safeJson(m.meta_json) : undefined,
            streaming: false,
          })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    if (athleteId) loadAthlete(athleteId, sessionId);
  }, [athleteId, sessionId, loadAthlete]);

  async function startNewConversation() {
    if (!athleteId || newSessionLoading) return;
    setNewSessionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId }),
      });
      if (!res.ok) {
        const err = await safeText(res);
        setError(`Could not start a new conversation: ${err || res.statusText}`);
        return;
      }
      // Drop any deep-linked session — the fresh conversation is now current.
      if (sessionId) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.delete("s");
        router.replace(`/george?${sp.toString()}`);
      }
      await loadAthlete(athleteId, null);
    } finally {
      setNewSessionLoading(false);
    }
  }

  // Autoscroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || !athleteId || sending) return;

    setSending(true);
    setError(null);

    // Append user message immediately
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantPlaceholder: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      streaming: true,
    };
    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    setInput("");

    try {
      const res = await fetch("/api/george/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          message: text,
          channel: "text",
          ...(sessionId ? { sessionId } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const err = await safeText(res);
        setError(`George could not respond: ${err || res.statusText}`);
        setMessages(prev => prev.filter(m => m.id !== assistantPlaceholder.id));
        return;
      }

      await consumeSSE(res.body, (event, data) => {
        if (event === "text" && typeof data.text === "string") {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantPlaceholder.id
                ? { ...m, content: m.content + data.text }
                : m,
            ),
          );
        } else if (event === "meta") {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantPlaceholder.id
                ? { ...m, meta: data as Record<string, unknown> }
                : m,
            ),
          );
          // The server applies profile_updates / persists protocol_cards when the
          // meta arrives — nudge the context rail to refetch profile + active trial.
          window.dispatchEvent(new CustomEvent("whatsupp:context-refresh"));
        } else if (event === "done") {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantPlaceholder.id ? { ...m, streaming: false } : m,
            ),
          );
        } else if (event === "error" && typeof data.message === "string") {
          setError(data.message);
          setMessages(prev => prev.filter(m => m.id !== assistantPlaceholder.id));
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Streaming failed");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!athleteId) {
    return <EmptyState message="Choose an athlete from the sidebar to start a conversation with George." />;
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex flex-col h-full flex-1 min-w-0">
        {/* Header — slim dark toolbar with George identity + chat controls */}
        <header className="wa-rail-header px-6 py-3 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-[10px] text-bg-0 text-[15px] font-bold flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, var(--lime), var(--lime-deep))", fontFamily: "var(--font-display)" }}
              >
                G
              </div>
              <div>
                <h1 className="text-[15px] font-semibold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
                  George
                </h1>
                <p className="hd !text-[9px] tracking-[0.16em] leading-tight mt-0.5">
                  AI Sports Dietitian · with {athlete?.name ?? "…"}
                  {athlete?.sport ? ` · ${firstWord(athlete.sport)}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {compareEntries.length > 0 && (
                <button
                  onClick={() => {
                    setCompareFocusId(compareEntries[compareEntries.length - 1]?.id ?? null);
                    setCompareOpen(true);
                  }}
                  className="btn-ghost inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
                  title="Re-open the generic-AI comparison log"
                >
                  <span>Compare log</span>
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-lime text-bg-0 text-[10px] font-semibold">
                    {compareEntries.length}
                  </span>
                </button>
              )}
              <button
                onClick={() => setVoiceOpen(true)}
                disabled={!athleteId || voiceOpen}
                className="btn-ghost inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-full"
                title="Talk to George out loud"
              >
                <span className="live-dot !w-1.5 !h-1.5" />
                <span>Voice</span>
              </button>
              <button
                onClick={startNewConversation}
                disabled={sending || newSessionLoading || !athleteId}
                className="text-xs text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2"
                title="Start a new conversation. George will summarise this one and remember the topic."
              >
                {newSessionLoading ? "Starting…" : "+ New chat"}
              </button>
            </div>
          </div>
        </header>

        {/* Messages — deck-dark chat surface */}
        <div ref={scrollRef} className="chat-surface flex-1 overflow-y-auto px-7 py-7">
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.length === 0 && (
              <FirstMessage athlete={athlete} />
            )}
            {messages.map(m => (
              <MessageBubble
                key={m.id}
                message={m}
                athleteName={athlete?.name}
                onCompare={m.role === "assistant" ? () => startCompare(m.id) : undefined}
                onWiseCrowd={m.role === "assistant" ? () => openWiseCrowd(m.id) : undefined}
              />
            ))}
            {error && (
              <div className="text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-md px-4 py-3">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="px-7 pb-5 pt-3 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="composer pl-[18px] pr-2 py-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  athlete?.sport
                    ? `Ask George about ${firstWord(athlete.sport)} nutrition — no edge case too hard…`
                    : "Ask George anything — no edge case too hard…"
                }
                rows={1}
                className="flex-1 resize-none bg-transparent border-none outline-none text-[13.5px] leading-relaxed text-foreground placeholder:text-text-4"
                disabled={sending}
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="w-9 h-9 rounded-[10px] btn-send flex items-center justify-center shrink-0"
                aria-label="Send"
              >
                {sending ? (
                  <span className="text-sm">…</span>
                ) : (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="hd !text-[9px] tracking-[0.12em] text-center mt-2">
              Powered by the scientists who write the research — not just the papers they publish
            </div>
          </div>
        </div>

        {/* Compare panel — entries persist across opens/closes for the demo log */}
        {compareOpen && (
          <ComparePanel
            entries={compareEntries}
            focusEntryId={compareFocusId}
            onClose={() => setCompareOpen(false)}
            onClear={() => { setCompareEntries([]); setCompareFocusId(null); }}
          />
        )}

        {/* Voice mode overlay */}
        {voiceOpen && athleteId && athlete && (
          <VoiceMode
            athleteId={athleteId}
            athleteName={athlete.name}
            onClose={() => {
              setVoiceOpen(false);
              // Reload athlete so voice-mode persisted transcripts appear in chat history.
              if (athleteId) loadAthlete(athleteId, sessionId);
            }}
          />
        )}
      </div>

      {/* Context rail — athlete profile, active trial, connected apps */}
      <ContextRail athleteId={athleteId} />
    </div>
  );
}

function FirstMessage({ athlete }: { athlete: AthleteSummary | null }) {
  if (!athlete) return null;
  const fresh = !athlete.sport && !athlete.context;
  return (
    <div className="flex justify-center">
      <div className="text-[11.5px] text-muted bg-bg-2 rounded-full px-4 py-1.5 border border-line max-w-md text-center leading-snug">
        {fresh ? (
          <>End-to-end private. Messages stay between you and George — when the Wise Crowd is consulted, only the scenario is shared, never your name.</>
        ) : (
          <>New chat with {athlete.name}. Ask about caffeine, bicarb, race-day timing, or anything in George&apos;s domain.</>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-8">
      <p className="text-sm text-muted max-w-md text-center">{message}</p>
    </div>
  );
}

async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: Record<string, unknown>) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by \n\n
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        onEvent(event, parsed);
      } catch {
        // ignore malformed
      }
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}

function safeJson(s: string): Record<string, unknown> | undefined {
  try { return JSON.parse(s); } catch { return undefined; }
}

function firstWord(s: string): string {
  return s.split(/[\s(]+/)[0] ?? s;
}
