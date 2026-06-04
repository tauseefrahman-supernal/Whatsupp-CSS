"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  keys: { anthropic: boolean; openai: boolean };
  models: {
    anthropic: string;
    anthropic_fast: string;
    openai_compare: string;
    openai_realtime: string;
  };
  vault: { scenarios: number; experts: number };
}

interface VoiceOption {
  id: string;
  label: string;
  desc: string;
}

const VOICE_OPTIONS: VoiceOption[] = [
  { id: "cedar",   label: "Cedar",   desc: "Warm older-counsel male · Clooney register (default)" },
  { id: "ballad",  label: "Ballad",  desc: "Lighter male · considered" },
  { id: "marin",   label: "Marin",   desc: "Warm female · OpenAI's recommended" },
  { id: "coral",   label: "Coral",   desc: "Brighter female · animated" },
];

const VOICE_KEY = "whatsupp.voice";

export function SettingsView() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [voice, setVoice] = useState<string>("cedar");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(VOICE_KEY) : null;
    if (stored && VOICE_OPTIONS.find(o => o.id === stored)) setVoice(stored);

    fetch("/api/status")
      .then(r => r.json())
      .then(setStatus)
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, []);

  function selectVoice(id: string) {
    setVoice(id);
    if (typeof window !== "undefined") localStorage.setItem(VOICE_KEY, id);
    setSaved(true);
    window.clearTimeout((selectVoice as unknown as { _t?: number })._t);
    (selectVoice as unknown as { _t?: number })._t = window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <header className="mb-8">
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted mt-1">Voice persona, API status, Vault contents.</p>
        </header>

        {/* Voice persona */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold">Voice persona</h2>
            {saved && <span className="text-[11px] text-brand font-medium">Saved</span>}
          </div>
          <p className="text-xs text-muted mb-3">
            Pick George's voice. Applies on the next voice session — close and reopen voice if you're already in a call.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {VOICE_OPTIONS.map(o => (
              <button
                key={o.id}
                onClick={() => selectVoice(o.id)}
                className={[
                  "text-left rounded-xl border px-4 py-3 transition-colors",
                  voice === o.id
                    ? "border-brand bg-brand-soft text-foreground"
                    : "border-border bg-surface text-foreground hover:bg-surface-2",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className="text-sm font-semibold">{o.label}</span>
                  {voice === o.id && (
                    <span className="text-[10px] uppercase tracking-wider text-brand font-medium">Selected</span>
                  )}
                </div>
                <span className="text-[11px] text-muted">{o.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* API status */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-3">Status</h2>
          {loading ? (
            <div className="text-sm text-muted">Checking…</div>
          ) : status ? (
            <div className="card divide-y divide-border">
              <StatusRow label="Anthropic key" ok={status.keys.anthropic} value={status.keys.anthropic ? "connected" : "missing"} />
              <StatusRow label="OpenAI key" ok={status.keys.openai} value={status.keys.openai ? "connected" : "missing"} />
              <Row label="Claude model" value={status.models.anthropic} mono />
              <Row label="Claude fast" value={status.models.anthropic_fast} mono />
              <Row label="GPT compare" value={status.models.openai_compare} mono />
              <Row label="OpenAI Realtime" value={status.models.openai_realtime} mono />
            </div>
          ) : (
            <div className="text-sm text-confidence-low">Could not load status.</div>
          )}
        </section>

        {/* Vault */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-3">The Vault</h2>
          {status ? (
            <div className="card divide-y divide-border">
              <Row label="Scenarios" value={`${status.vault.scenarios} grounding scenarios loaded`} />
              <Row label="Wise Crowd" value={`${status.vault.experts} credentialed experts on panel`} />
              <Row label="Voice anchor" value="canonical Louise/Mia dialogue" />
              <Row label="Values" value="batch-tested, in-nutrition framing, medical-team referral, N-of-1 closing" />
            </div>
          ) : null}
        </section>

        {/* About */}
        <section>
          <h2 className="text-sm font-semibold mb-3">About</h2>
          <div className="card px-5 py-4 text-sm text-foreground/80 leading-relaxed">
            Whatsupp is an AI-employee–driven sports-nutrition platform. George is calibrated on Dr Louise Burke&apos;s expertise and the Wise Crowd panel — and grounds every answer on a curated Vault, not generic AI training data. The architecture is the product.
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 items-center">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="flex items-center gap-2 text-sm">
        <span className={[
          "inline-block w-2 h-2 rounded-full",
          ok ? "bg-confidence-high" : "bg-confidence-low",
        ].join(" ")} />
        <span className={ok ? "text-foreground" : "text-confidence-low"}>{value}</span>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 items-center">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={["text-sm text-foreground/90", mono ? "font-mono text-[12px]" : ""].join(" ")}>{value}</div>
    </div>
  );
}
