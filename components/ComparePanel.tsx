"use client";

import { useEffect, useRef } from "react";

export interface CompareResult {
  ok: boolean;
  value?: string;
  error?: string;
}

export interface CompareEntry {
  id: string;
  assistantId: string;
  question: string;
  askedAt: number;
  status: "loading" | "ok" | "error";
  gpt?: CompareResult;
  claude?: CompareResult;
  models?: { gpt: string; claude: string };
  error?: string;
}

interface Props {
  entries: CompareEntry[];
  focusEntryId: string | null;
  onClose: () => void;
  onClear: () => void;
}

export function ComparePanel({ entries, focusEntryId, onClose, onClear }: Props) {
  // Close on Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Scroll focused entry into view
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusEntryId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusEntryId]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in"
        aria-hidden
      />

      {/* Panel */}
      <aside className="fixed right-0 top-0 h-full w-[520px] max-w-[92vw] bg-surface border-l border-border shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <header className="px-6 py-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>How generic AI would answer</h2>
            <p className="text-xs text-muted mt-0.5">
              Same question. No Vault. No system prompt. No memory.
              {entries.length > 0 && (
                <span className="ml-1 text-muted">· {entries.length} comparison{entries.length === 1 ? "" : "s"} this session</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {entries.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Clear all comparisons in this session?")) onClear();
                }}
                className="text-[11px] text-muted hover:text-foreground px-2 py-1 rounded hover:bg-surface-2 transition-colors"
                title="Clear comparison history"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground text-lg leading-none px-2 -mr-2"
              aria-label="Close compare panel"
            >
              ×
            </button>
          </div>
        </header>

        {/* Body — running log of comparisons, newest first */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">
              No comparisons yet. Tap <span className="font-medium">Compare</span> under any George reply to see how a generic AI would answer the same question.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {[...entries].reverse().map(entry => (
                <div
                  key={entry.id}
                  ref={entry.id === focusEntryId ? focusRef : null}
                  className={`px-6 py-5 ${entry.id === focusEntryId ? "bg-surface-2/40" : ""}`}
                >
                  {/* Question */}
                  <div className="mb-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <div className="hd">Question</div>
                      <div className="text-[10px] text-muted font-mono">{formatTime(entry.askedAt)}</div>
                    </div>
                    <div className="text-[13px] text-foreground/90 leading-relaxed bg-surface-2/50 rounded-md px-3 py-2 border border-border/50">
                      {entry.question}
                    </div>
                  </div>

                  {/* Status / results */}
                  {entry.status === "loading" && (
                    <div className="text-sm text-muted">Asking ChatGPT and Claude in parallel…</div>
                  )}

                  {entry.status === "error" && (
                    <div className="text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-md px-3 py-2">
                      {entry.error ?? "Compare failed"}
                    </div>
                  )}

                  {entry.status === "ok" && entry.gpt && entry.claude && entry.models && (
                    <div className="space-y-4">
                      <ResponseCard label="ChatGPT" model={entry.models.gpt} result={entry.gpt} />
                      <ResponseCard
                        label="Claude"
                        model={entry.models.claude}
                        sublabel="raw — no Vault, no system prompt"
                        result={entry.claude}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border text-[11px] text-muted">
          George grounds on the Vault — Louise&apos;s curated knowledge. These don&apos;t.
        </div>
      </aside>
    </>
  );
}

function ResponseCard({
  label,
  model,
  sublabel,
  result,
}: {
  label: string;
  model: string;
  sublabel?: string;
  result: CompareResult;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-foreground">{label}</span>
          <span className="text-[10px] text-muted font-mono">{model}</span>
        </div>
        {sublabel && <span className="text-[10px] text-muted italic">{sublabel}</span>}
      </div>
      <div className="rounded-lg border border-border bg-background px-4 py-3 text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap george-prose">
        {result.ok
          ? result.value
          : <span className="text-confidence-low">Error: {result.error}</span>}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
