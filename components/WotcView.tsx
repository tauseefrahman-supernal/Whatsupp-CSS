"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ExpertReply, ExpertTyping, type ExpertInfo } from "./ExpertReply";
import { PanelRoster, type RosterStatus } from "./PanelRoster";
import { VerdictBanner } from "./VerdictBanner";

interface CrowdResult {
  mode: "crowd";
  experts: Array<{ expert: ExpertInfo; response: string; ok: boolean; error?: string }>;
  consensus: string;
}

type Phase = "idle" | "consulting" | "revealing" | "done";
type AskMode = "crowd" | "expert";
type ExpertKind = "ai" | "live";

const CHAIR_ID = "burke";
const LIVE_ROUTE_MS = 6000; // simulated live-expert SLA, compressed for the demo
const REVEAL_MS = 1400;   // gap between expert replies appearing
const TYPING_MS = 1100;   // how long an expert "types" before their reply lands

export function WotcView() {
  const searchParams = useSearchParams();
  const initialQuestion = searchParams.get("q") ?? "";
  const autoConvene = searchParams.get("auto") === "1";

  const [experts, setExperts] = useState<ExpertInfo[]>([]);
  const [question, setQuestion] = useState(initialQuestion);
  const [askMode, setAskMode] = useState<AskMode>("crowd");
  const [expertId, setExpertId] = useState<string>("burke");
  const [expertKind, setExpertKind] = useState<ExpertKind>("ai");
  const [askedMode, setAskedMode] = useState<AskMode>("crowd");
  const [askedExpert, setAskedExpert] = useState<ExpertInfo | null>(null);
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statuses, setStatuses] = useState<Record<string, RosterStatus>>({});
  const [revealed, setRevealed] = useState<Array<{ expert: ExpertInfo; response: string }>>([]);
  const [typingExpert, setTypingExpert] = useState<ExpertInfo | null>(null);
  const [result, setResult] = useState<CrowdResult | null>(null);
  const [showConsensus, setShowConsensus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All choreography timeouts live here so unmount / re-ask can cancel them.
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);
  const cancelTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);
  useEffect(() => cancelTimeouts, [cancelTimeouts]);

  useEffect(() => {
    fetch("/api/wotc")
      .then(r => r.json())
      .then(j => setExperts(j.experts ?? []))
      .catch(() => { /* ignore */ });
  }, []);

  const busy = phase === "consulting" || phase === "revealing";

  /** Reveal each successful expert reply on a stagger, then the consensus.
   *  The API has already returned everything — this is pure front-end theatre
   *  that demonstrates the asking mechanism: invited → typing… → replied. */
  const choreograph = useCallback((crowd: CrowdResult) => {
    setPhase("revealing");
    const successful = crowd.experts.filter(o => o.ok);
    const failed = crowd.experts.filter(o => !o.ok);
    if (failed.length > 0) {
      setStatuses(prev => {
        const next = { ...prev };
        failed.forEach(f => { next[f.expert.id] = "declined"; });
        return next;
      });
    }

    // Chair (Burke) replies first if present — the deck shows her leading.
    const ordered = [
      ...successful.filter(o => o.expert.id === CHAIR_ID),
      ...successful.filter(o => o.expert.id !== CHAIR_ID),
    ];

    ordered.forEach((o, i) => {
      const tStart = i * REVEAL_MS;
      later(() => {
        setTypingExpert(o.expert);
        setStatuses(prev => ({ ...prev, [o.expert.id]: "typing" }));
      }, tStart);
      later(() => {
        setTypingExpert(null);
        setRevealed(prev => [...prev, { expert: o.expert, response: o.response }]);
        setStatuses(prev => ({ ...prev, [o.expert.id]: "replied" }));
      }, tStart + TYPING_MS);
    });

    later(() => {
      setShowConsensus(true);
      setPhase("done");
    }, ordered.length * REVEAL_MS + 700);
  }, [later]);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (q.length < 8 || busy) return;

    cancelTimeouts();
    setError(null);
    setResult(null);
    setRevealed([]);
    setTypingExpert(null);
    setShowConsensus(false);
    setAskedQuestion(q);
    setAskedMode(askMode);
    setPhase("consulting");

    // --- Single expert: George routes to the AI-expert (instant) or the live
    // expert (simulated routing delay). One reply, no consensus synthesis. ---
    if (askMode === "expert") {
      const expert = experts.find(e => e.id === expertId) ?? experts[0];
      if (!expert) {
        setError("Expert roster is still loading — try again in a second.");
        setPhase("idle");
        return;
      }
      setAskedExpert(expert);
      setStatuses({ [expert.id]: "invited" });
      later(() => {
        setStatuses(prev => ({ ...prev, [expert.id]: "typing" }));
        setTypingExpert(expert);
      }, 900);

      try {
        const res = await fetch("/api/wotc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            expertKind === "ai"
              ? { mode: "trent", expertId: expert.id, question: q }
              : { mode: "live", expertId: expert.id, question: q, delayMs: LIVE_ROUTE_MS },
          ),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.detail ?? j.error ?? `HTTP ${res.status}`);
          setPhase("idle");
          return;
        }
        const j = await res.json() as { response: string };
        cancelTimeouts();
        setTypingExpert(null);
        setRevealed([{ expert, response: j.response }]);
        setStatuses({ [expert.id]: "replied" });
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("idle");
      }
      return;
    }

    // --- Full crowd ---
    setAskedExpert(null);
    setStatuses(Object.fromEntries(experts.map(e => [e.id, "invited" as RosterStatus])));

    // A little life while the panel deliberates: the chair starts "typing" first.
    later(() => {
      setStatuses(prev => (prev[CHAIR_ID] ? { ...prev, [CHAIR_ID]: "typing" } : prev));
    }, 1200);

    try {
      const res = await fetch("/api/wotc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "crowd", question: q }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.detail ?? j.error ?? `HTTP ${res.status}`);
        setPhase("idle");
        return;
      }
      const j = await res.json() as CrowdResult;
      setResult(j);
      choreograph(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }, [question, busy, experts, askMode, expertId, expertKind, cancelTimeouts, later, choreograph]);

  // Arriving from George's "Ask the Wise Crowd" escalation (?auto=1) — convene
  // the crowd immediately, once the roster has loaded. Fires at most once.
  const autoConvenedRef = useRef(false);
  useEffect(() => {
    if (
      autoConvene &&
      !autoConvenedRef.current &&
      experts.length > 0 &&
      phase === "idle" &&
      !askedQuestion &&
      initialQuestion.trim().length >= 8
    ) {
      autoConvenedRef.current = true;
      ask();
    }
  }, [autoConvene, experts, phase, askedQuestion, initialQuestion, ask]);

  const reset = useCallback(() => {
    cancelTimeouts();
    setPhase("idle");
    setAskedQuestion(null);
    setAskedExpert(null);
    setResult(null);
    setRevealed([]);
    setTypingExpert(null);
    setShowConsensus(false);
    setStatuses({});
    setError(null);
    setQuestion("");
  }, [cancelTimeouts]);

  const respondedCount = result ? result.experts.filter(o => o.ok).length : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1060px] mx-auto px-8 py-7">
        {/* Page head */}
        <header className="mb-6">
          <div className="eyebrow mb-2">Engage the wise crowd</div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]" style={{ fontFamily: "var(--font-display)" }}>
            Expert escalation
          </h1>
          <p className="text-[13px] text-muted mt-1.5 max-w-2xl">
            George convenes the supplement experts for the really intriguing questions.
            Collective wisdom, properly assembled — crowd-sourced information isn&apos;t
            intrinsically smart, but George has a knack for getting the panel together.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 items-start">
          {/* Left — question + thread */}
          <div className="panel px-[22px] py-5">
            {phase === "idle" && !askedQuestion ? (
              <>
                <div className="hd mb-3">Escalate a question</div>

                {/* Routing toggle — full crowd vs a single expert */}
                <div className="flex items-center gap-1.5 mb-3">
                  {([
                    { key: "crowd" as AskMode, label: "Convene the crowd" },
                    { key: "expert" as AskMode, label: "Ask one expert" },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setAskMode(opt.key)}
                      className={[
                        "px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors",
                        askMode === opt.key
                          ? "bg-lime-glow border-[rgba(182,245,105,0.35)] text-foreground"
                          : "border-line text-muted hover:text-foreground hover:bg-[rgba(244,247,251,0.04)]",
                      ].join(" ")}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {askMode === "expert" && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <select
                      value={expertId}
                      onChange={e => setExpertId(e.target.value)}
                      className="field-dark px-2.5 py-1.5 text-[12.5px] max-w-[260px]"
                    >
                      {experts.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                    {([
                      { key: "ai" as ExpertKind, label: "AI-expert · instant" },
                      { key: "live" as ExpertKind, label: "Live expert · routed" },
                    ]).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setExpertKind(opt.key)}
                        className={[
                          "px-2.5 py-1 rounded-full text-[11px] border transition-colors",
                          expertKind === opt.key
                            ? "bg-lime-glow border-[rgba(182,245,105,0.35)] text-foreground"
                            : "border-line text-muted hover:text-foreground",
                        ].join(" ")}
                        style={{ fontFamily: "var(--font-mono-deck)" }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder={
                    askMode === "crowd"
                      ? "Paste an athlete question — the more specific, the better the crowd's answer."
                      : "Paste an athlete question — George will brief the expert you chose."
                  }
                  rows={5}
                  className="field-dark w-full px-3.5 py-3 text-[13.5px] leading-relaxed resize-none"
                />
                <div className="flex items-center justify-between gap-4 mt-3">
                  <p className="text-[11px] text-text-4 leading-snug">
                    {askMode === "crowd"
                      ? "Questions are anonymised before they reach experts — no athlete name, no identifying details."
                      : expertKind === "live"
                        ? "Live routing is a real 24–48 h SLA — compressed to seconds for this demo. Anonymised, as always."
                        : "The AI-expert is calibrated on the expert's published work and voice. Anonymised, as always."}
                  </p>
                  <button
                    onClick={ask}
                    disabled={question.trim().length < 8}
                    className="btn-primary px-5 py-2.5 rounded-lg text-sm shrink-0"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {askMode === "crowd"
                      ? "Convene the crowd"
                      : `Ask ${shortName(experts.find(e => e.id === expertId)?.name) ?? "the expert"}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* The asked question, framed like the deck */}
                <div
                  className="text-[16px] font-semibold leading-normal text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  &ldquo;{askedQuestion}&rdquo;
                </div>
                <div
                  className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-text-4"
                  style={{ fontFamily: "var(--font-mono-deck)" }}
                >
                  <span>Escalated by <span className="text-cyan">George</span></span>
                  {askedMode === "expert" && askedExpert ? (
                    <span>
                      routed to <span className="text-cyan">{askedExpert.name}</span>
                      {" "}({expertKind === "ai" ? "AI-expert" : "live"})
                    </span>
                  ) : (
                    <span>
                      <span className="text-cyan">{experts.length || 10} experts</span> convened
                    </span>
                  )}
                  {phase === "consulting" && (
                    <span className="text-lime">
                      {askedMode === "expert"
                        ? (expertKind === "live" ? "routing to the live expert…" : "expert considering…")
                        : "panel deliberating…"}
                    </span>
                  )}
                  {phase === "revealing" && <span className="text-lime">{revealed.length} / {respondedCount} replied</span>}
                  {phase === "done" && (
                    <span className="text-lime">{askedMode === "expert" ? "reply received" : "consensus reached"}</span>
                  )}
                </div>

                {/* Consulting shimmer */}
                {phase === "consulting" && (
                  <div className="border-t border-line mt-4 pt-4 flex items-center gap-3 text-[12.5px] text-muted">
                    <span className="typing"><i /><i /><i /></span>
                    {askedMode === "expert" && askedExpert
                      ? expertKind === "live"
                        ? `George has routed your question to ${askedExpert.name} — waiting on their reply…`
                        : `George is briefing ${askedExpert.name}…`
                      : "George is briefing the panel — experts respond in parallel…"}
                  </div>
                )}

                {/* Revealed expert replies */}
                {revealed.map(r => (
                  <ExpertReply
                    key={r.expert.id}
                    expert={r.expert}
                    response={r.response}
                    chair={r.expert.id === CHAIR_ID}
                  />
                ))}
                {typingExpert && <ExpertTyping expert={typingExpert} />}

                {/* Consensus verdict */}
                {showConsensus && result && (
                  <div className="mt-5">
                    <VerdictBanner
                      consensus={result.consensus}
                      responded={respondedCount}
                      total={result.experts.length}
                    />
                  </div>
                )}

                {phase === "done" && (
                  <div className="mt-4 flex justify-end">
                    <button onClick={reset} className="action-chip">
                      Ask another question
                    </button>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="mt-4 text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-lg px-4 py-3 whitespace-pre-wrap">
                {error}
                {askedQuestion && (
                  <button onClick={reset} className="block mt-2 text-xs text-muted hover:text-foreground underline">
                    Start over
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right — roster + how it works */}
          <div className="space-y-3.5">
            <PanelRoster experts={experts} statuses={statuses} chairId={CHAIR_ID} />

            <div className="panel px-5 py-[18px]">
              <div className="hd mb-2">How this works</div>
              <div className="check-row text-xs">
                George drafts the case brief
                <span className={["check-pill", askedQuestion ? "ok" : "info"].join(" ")}>
                  {askedQuestion ? "done" : "on ask"}
                </span>
              </div>
              <div className="check-row text-xs">
                Experts respond asynchronously
                <span className={["check-pill", phase === "done" ? "ok" : "info"].join(" ")}>
                  {phase === "done" ? "done" : busy ? "in flight" : "—"}
                </span>
              </div>
              <div className="check-row text-xs">
                George synthesises consensus
                <span className={["check-pill", showConsensus ? "ok" : "info"].join(" ")}>
                  {showConsensus ? "done" : "after replies"}
                </span>
              </div>
              <div className="check-row text-xs">
                Anonymised → trial library
                <span className="check-pill info">opt-in</span>
              </div>
            </div>
          </div>
        </div>

        {/* Differentiation strip — kept identical across modes */}
        <div className="mt-3.5 panel border-dashed !border-line-strong px-5 py-3.5 flex items-center gap-3.5 text-[12.5px] text-muted">
          <span className="text-pink text-[11px] shrink-0" style={{ fontFamily: "var(--font-mono-deck)" }}>
            ✕ OTHER AI
          </span>
          <span>
            <span className="text-foreground font-medium">Generic AI averages the population.</span>{" "}
            George convenes the people who wrote the research — and gets you a wise answer.
          </span>
        </div>
      </div>
    </div>
  );
}

/** "Dr Louise Burke" → "Burke" for compact button labels. Anonymous
 *  "Panel Member N" labels are kept whole (a bare "N" would read oddly). */
function shortName(full?: string): string | null {
  if (!full) return null;
  if (/^panel member/i.test(full.trim())) return full.trim();
  const parts = full.replace(/^Dr\s+/i, "").trim().split(/\s+/);
  return parts[parts.length - 1] ?? null;
}
