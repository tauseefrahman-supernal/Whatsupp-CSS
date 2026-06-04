"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { ComparePanel, type CompareEntry } from "./ComparePanel";
import { VoiceMode } from "./VoiceMode";

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
  const athleteId = searchParams.get("a");
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

  // Wise Crowd CTA → deep-link to /wotc with the user question pre-filled.
  const openWiseCrowd = useCallback((assistantId: string) => {
    const question = findPrecedingUserQuestion(assistantId);
    if (!question) return;
    const params = new URLSearchParams();
    if (athleteId) params.set("a", athleteId);
    params.set("q", question);
    router.push(`/wotc?${params.toString()}`);
  }, [router, athleteId, findPrecedingUserQuestion]);

  // Load athlete + history whenever athleteId changes.
  const loadAthlete = useCallback(async (id: string) => {
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
      const recent = (data.recentMessages ?? []) as Array<{
        id: string;
        role: "user" | "assistant" | "system";
        content: string;
        meta_json?: string | null;
        created_at: number;
      }>;
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
    if (athleteId) loadAthlete(athleteId);
  }, [athleteId, loadAthlete]);

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
      await loadAthlete(athleteId);
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
        body: JSON.stringify({ athleteId, message: text, channel: "text" }),
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
    <div className="flex flex-col h-full">
      {/* Header — WA-teal strip with George avatar + athlete name */}
      <header className="wa-rail-header px-5 py-3 border-b border-black/10">
        <div className="flex items-center justify-between gap-4 max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/15 text-white text-[13px] font-semibold flex items-center justify-center ring-1 ring-white/20">
              G
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-tight">
                George
              </h1>
              <p className="text-[11px] text-white/70 leading-tight">
                AI Supplement Counsel · with {athlete?.name ?? "…"}
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
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1.5 rounded-full transition-colors"
                title="Re-open the generic-AI comparison log"
              >
                <span>Compare log</span>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-[10px] font-semibold">
                  {compareEntries.length}
                </span>
              </button>
            )}
            <button
              onClick={() => setVoiceOpen(true)}
              disabled={!athleteId || voiceOpen}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 border border-white/15 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-full transition-colors"
              title="Talk to George out loud"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#DE478E] animate-pulse" />
              <span>Voice</span>
            </button>
            <button
              onClick={startNewConversation}
              disabled={sending || newSessionLoading || !athleteId}
              className="text-xs text-white/80 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2"
              title="Start a new conversation. George will summarise this one and remember the topic."
            >
              {newSessionLoading ? "Starting…" : "+ New chat"}
            </button>
          </div>
        </div>
      </header>

      {/* Messages — WA chat surface */}
      <div ref={scrollRef} className="chat-surface flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-3.5">
          {messages.length === 0 && (
            <FirstMessage athlete={athlete} />
          )}
          {messages.map(m => (
            <MessageBubble
              key={m.id}
              message={m}
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
      <div className="border-t border-border bg-surface-2 px-5 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                athlete?.sport
                  ? `Message George about ${firstWord(athlete.sport)} nutrition…`
                  : "Tell George about yourself and your sporting life…"
              }
              rows={1}
              className="flex-1 resize-none px-4 py-2.5 rounded-full border border-border bg-white text-[14.5px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/40"
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="w-11 h-11 rounded-full btn-send flex items-center justify-center shadow-sm"
              aria-label="Send"
            >
              {sending ? (
                <span className="text-sm">…</span>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
                  <path d="M2.01 21l20.99-9L2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
          <div className="text-[10.5px] text-muted mt-1.5 px-2">
            George is calibrated to Dr Louise Burke. Answers grounded on the WhatSupp Vault — not generic LLMs.
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
            if (athleteId) loadAthlete(athleteId);
          }}
        />
      )}
    </div>
  );
}

function FirstMessage({ athlete }: { athlete: AthleteSummary | null }) {
  if (!athlete) return null;
  const fresh = !athlete.sport && !athlete.context;
  return (
    <div className="flex justify-center">
      <div className="text-[11.5px] text-muted bg-white/70 backdrop-blur rounded-md px-3 py-1.5 shadow-sm border border-black/5 max-w-md text-center leading-snug">
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
