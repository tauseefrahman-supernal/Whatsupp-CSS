"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface Expert {
  id: string;
  name: string;
  affiliation?: string;
  domains?: string[];
  bio?: string;
  voice_notes?: string;
}

type Mode = "trent" | "live" | "crowd";

interface CrowdResult {
  mode: "crowd";
  experts: Array<{ expert: Expert; response: string; ok: boolean; error?: string }>;
  consensus: string;
}

interface SingleResult {
  mode: "trent" | "live";
  expertId: string;
  response: string;
}

type Result = CrowdResult | SingleResult;

export function WotcView() {
  const searchParams = useSearchParams();
  const initialQuestion = searchParams.get("q") ?? "";

  const [experts, setExperts] = useState<Expert[]>([]);
  const [mode, setMode] = useState<Mode>("crowd");
  const [expertId, setExpertId] = useState<string>("stellingwerff");
  const [question, setQuestion] = useState(initialQuestion);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wotc")
      .then(r => r.json())
      .then(j => setExperts(j.experts ?? []))
      .catch(() => { /* ignore */ });
  }, []);

  const askCrowd = useCallback(async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    // Friendly progress text per mode
    if (mode === "crowd") setStatus("Asking 10 experts in parallel…");
    else if (mode === "live") setStatus("Routing question to expert · simulated turnaround…");
    else setStatus("Consulting expert…");

    try {
      const res = await fetch("/api/wotc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "crowd"
            ? { mode, question: question.trim() }
            : { mode, expertId, question: question.trim(), ...(mode === "live" ? { delayMs: 9000 } : {}) },
        ),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.detail ?? j.error ?? `HTTP ${res.status}`);
        return;
      }
      const j = await res.json() as Result;
      setResult(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }, [mode, expertId, question, loading]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">Wise Crowd</h1>
          <p className="text-sm text-muted mt-1">
            Escalate a question beyond what George knows on his own. Pick a single expert (AI-Trent style), simulate live routing (24–48h SLA, compressed to ~10s for demo), or aggregate the full 10-expert panel.
          </p>
        </header>

        {/* Mode picker */}
        <section className="mb-5">
          <div className="grid grid-cols-3 gap-2">
            <ModeCard
              active={mode === "trent"}
              onClick={() => setMode("trent")}
              title="AI-Trent"
              subtitle="One named expert · fast"
            />
            <ModeCard
              active={mode === "live"}
              onClick={() => setMode("live")}
              title="Live expert"
              subtitle="Routed expert · ~10s simulated"
            />
            <ModeCard
              active={mode === "crowd"}
              onClick={() => setMode("crowd")}
              title="Wise Crowd"
              subtitle="10-expert consensus"
            />
          </div>
        </section>

        {/* Expert picker (for trent + live) */}
        {(mode === "trent" || mode === "live") && (
          <section className="mb-5">
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Expert</span>
              <select
                value={expertId}
                onChange={e => setExpertId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/15"
                disabled={loading}
              >
                {experts.map(e => (
                  <option key={e.id} value={e.id}>{e.name}{e.domains?.length ? ` — ${e.domains.slice(0, 2).join(", ")}` : ""}</option>
                ))}
              </select>
            </label>
          </section>
        )}

        {/* Question */}
        <section className="mb-5">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Question</span>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Paste an athlete question — the more specific, the better the crowd's answer."
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/15 leading-relaxed"
              disabled={loading}
            />
          </label>
        </section>

        <div className="flex items-center justify-between mb-8">
          <p className="text-[11px] text-muted">
            Questions are anonymised before they reach experts — no athlete name, no identifying details.
          </p>
          <button
            onClick={askCrowd}
            disabled={loading || question.trim().length < 8}
            className="px-4 py-2 rounded-md btn-primary text-sm font-medium"
          >
            {loading ? "Consulting…" : "Organise"}
          </button>
        </div>

        {error && (
          <div className="mb-6 text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-md px-4 py-3 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {loading && status && (
          <div className="mb-6 text-sm text-muted bg-surface/60 border border-border rounded-lg px-5 py-4 flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-foreground/60 animate-pulse" />
            {status}
          </div>
        )}

        {result && <ResultView result={result} experts={experts} />}
      </div>
    </div>
  );
}

function ModeCard({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        "text-left rounded-xl border px-4 py-3 transition-colors",
        active
          ? "border-brand bg-brand text-brand-foreground shadow-sm"
          : "border-border bg-surface text-foreground hover:bg-surface-2",
      ].join(" ")}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className={["text-[11px] mt-0.5", active ? "text-brand-foreground/75" : "text-muted"].join(" ")}>{subtitle}</div>
    </button>
  );
}

function ResultView({ result, experts }: { result: Result; experts: Expert[] }) {
  if (result.mode === "crowd") {
    return <CrowdResultView result={result} />;
  }
  const expert = experts.find(e => e.id === result.expertId);
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-semibold">{expert?.name ?? result.expertId}</div>
          <div className="text-[10px] text-muted">{result.mode === "live" ? "Live expert response" : "AI persona"}</div>
        </div>
        {expert?.domains?.length && (
          <div className="text-[11px] text-muted mb-2">{expert.domains.join(" · ")}</div>
        )}
        <p className="george-prose text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{result.response}</p>
      </div>
    </section>
  );
}

function CrowdResultView({ result }: { result: CrowdResult }) {
  const [showOpinions, setShowOpinions] = useState(false);
  const successful = result.experts.filter(o => o.ok);
  const failed = result.experts.filter(o => !o.ok);

  return (
    <section className="space-y-6">
      {/* Consensus */}
      <div className="rounded-xl border border-border bg-surface px-6 py-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold">Crowd consensus</h2>
          <div className="text-[10px] text-muted">{successful.length}/{result.experts.length} experts responded</div>
        </div>
        <div className="george-prose text-[14px] leading-relaxed text-foreground/95 whitespace-pre-wrap">{result.consensus}</div>
      </div>

      {/* Individual opinions (collapsible) */}
      <div>
        <button
          onClick={() => setShowOpinions(v => !v)}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          {showOpinions ? "Hide" : "Show"} {successful.length} individual expert responses
        </button>

        {showOpinions && (
          <div className="mt-3 space-y-3">
            {successful.map(o => (
              <div key={o.expert.id} className="rounded-lg border border-border bg-surface px-5 py-4">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-sm font-semibold">{o.expert.name}</div>
                  {o.expert.affiliation && <div className="text-[10px] text-muted">{o.expert.affiliation}</div>}
                </div>
                {o.expert.domains?.length && (
                  <div className="text-[11px] text-muted mb-2">{o.expert.domains.join(" · ")}</div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">{o.response}</p>
              </div>
            ))}
            {failed.length > 0 && (
              <div className="text-xs text-confidence-low">
                {failed.length} experts failed to respond: {failed.map(f => f.expert.name).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
