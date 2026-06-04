"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceMode } from "./VoiceMode";

export function OnboardingView() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAthlete(launchVoice: boolean) {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) {
        setError(`Could not create your athlete profile (${r.status})`);
        return;
      }
      const data = (await r.json()) as { athlete: { id: string; name: string } };
      setAthleteId(data.athlete.id);
      if (launchVoice) {
        setVoiceOpen(true);
      } else {
        router.push(`/george?a=${data.athlete.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create athlete");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto chat-surface">
      <div className="max-w-2xl mx-auto px-8 py-16">
        <div className="card overflow-hidden">
          <div className="wa-rail-header px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white/15 ring-1 ring-white/20 text-white text-base font-semibold flex items-center justify-center">G</div>
              <div>
                <div className="text-[16px] font-semibold leading-tight">Meet George</div>
                <div className="text-[12px] text-white/70 leading-tight">Calibrated to Dr Louise Burke · backed by the Wise Crowd</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 bg-surface">
            <h1 className="text-xl font-semibold text-foreground tracking-tight">
              A friendlier kind of intake.
            </h1>
            <p className="mt-2 text-[14.5px] text-foreground leading-relaxed">
              No forms. No checkboxes. George opens the conversation — voice or text — and
              gets to know you the same way a good practitioner would: by asking, listening,
              and remembering. Your sport, your training, the supplements you use, the way
              caffeine actually feels on you, the night you can't sleep. Bit by bit.
            </p>

            <div className="mt-5 card-soft p-4 bg-brand-soft/40 border-brand-soft-border">
              <div className="text-[12px] uppercase tracking-wider text-brand-hover font-semibold">What George will ask about</div>
              <ul className="mt-2 text-[13.5px] text-foreground grid grid-cols-2 gap-x-4 gap-y-1.5">
                <li>· Sport &amp; level</li>
                <li>· What you&apos;re training for</li>
                <li>· Supplements you currently use</li>
                <li>· Caffeine sensitivity</li>
                <li>· Sleep patterns</li>
                <li>· Work / life context</li>
                <li>· Any past reactions</li>
                <li>· The question on your mind</li>
              </ul>
            </div>

            <div className="mt-6">
              <label className="text-[12px] uppercase tracking-wider text-muted font-medium">Your name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="What should George call you?"
                className="mt-1.5 w-full px-4 py-2.5 rounded-lg border border-border bg-white text-[14.5px] focus:outline-none focus:ring-2 focus:ring-brand/40"
                onKeyDown={e => { if (e.key === "Enter") createAthlete(true); }}
              />
            </div>

            {error && (
              <div className="mt-4 text-sm text-confidence-low bg-confidence-low/5 border border-confidence-low/20 rounded-md px-4 py-3">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={() => createAthlete(true)}
                disabled={!name.trim() || creating}
                className="flex-1 btn-primary px-5 py-3 rounded-full text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm"
              >
                <VoiceIcon />
                <span>{creating ? "Setting up…" : "Talk to George (voice)"}</span>
              </button>
              <button
                onClick={() => createAthlete(false)}
                disabled={!name.trim() || creating}
                className="flex-1 px-5 py-3 rounded-full text-sm font-semibold border border-border text-foreground hover:bg-surface-2 inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChatIcon />
                <span>Chat in text instead</span>
              </button>
            </div>

            <p className="mt-4 text-[11.5px] text-muted leading-relaxed text-center">
              What you share stays between you and George. When the Wise Crowd is consulted,
              only the scenario is sent — never your name.
            </p>
          </div>
        </div>
      </div>

      {voiceOpen && athleteId && (
        <VoiceMode
          athleteId={athleteId}
          athleteName={name.trim()}
          onboarding
          onClose={() => {
            setVoiceOpen(false);
            // After voice onboarding ends, jump into text chat so the athlete can keep going.
            router.push(`/george?a=${athleteId}`);
          }}
        />
      )}
    </div>
  );
}

function VoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-6 9h2v2h-2v-2z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
    </svg>
  );
}
