"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Scenario {
  number: number;
  slug: string;
  title: string;
  tagline: string;
  summary: string;
  demonstrates: string[];
  primary_channel: string;
  secondary_channel: string | null;
  athlete: {
    name: string;
    sex?: string | null;
    age?: number | null;
    weight_kg?: number | null;
    sport?: string | null;
    level?: string | null;
    context?: string | null;
  };
  vault_entry_id: string;
  vault_path: string;
  opening_question: string;
  video_treatment: string;
}

interface Manifest {
  scenarios: Scenario[];
  production_notes: Record<string, unknown>;
}

export function ScenariosView() {
  const router = useRouter();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [playingSlug, setPlayingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/scenarios", { cache: "no-store" });
        const data = (await r.json()) as Manifest;
        setManifest(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load scenarios");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function play(slug: string) {
    setPlayingSlug(slug);
    setError(null);
    try {
      const r = await fetch(`/api/scenarios/${slug}/seed`, { method: "POST" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? `Could not seed scenario (${r.status})`);
        return;
      }
      const data = (await r.json()) as { athleteId: string; openingQuestion: string };
      const params = new URLSearchParams();
      params.set("a", data.athleteId);
      params.set("seed", slug);
      // Pre-fill the composer via query param. ChatPanel reads `?prefill=`.
      params.set("prefill", data.openingQuestion);
      router.push(`/george?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to play scenario");
    } finally {
      setPlayingSlug(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted">Loading scenarios…</div>;
  }
  if (error) {
    return <div className="p-8 text-sm text-confidence-low">{error}</div>;
  }
  if (!manifest) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <header className="mb-8">
          <div className="eyebrow mb-2">Demo · 4 canonical films</div>
          <h1 className="text-2xl font-semibold text-foreground tracking-[-0.01em]" style={{ fontFamily: "var(--font-display)" }}>Demo Scenarios</h1>
          <p className="mt-1.5 text-sm text-muted leading-relaxed max-w-2xl">
            The four canonical scenarios that anchor the WhatSupp investor films. Each one
            seeds a demo athlete with the right archetype and pre-fills the canonical opening
            question, so George can answer it the way Louise would. Press <span className="font-medium text-foreground">Play</span> to
            jump into the chat with the question already in the composer.
          </p>
        </header>

        <div className="grid gap-5">
          {manifest.scenarios.map(s => (
            <div key={s.slug} className="card overflow-hidden">
              <div className="flex items-start gap-5 p-5">
                <div
                  className="shrink-0 w-12 h-12 rounded-[14px] text-bg-0 flex items-center justify-center text-lg font-bold"
                  style={{ background: "linear-gradient(135deg, var(--lime), var(--lime-deep))", fontFamily: "var(--font-display)" }}
                >
                  {s.number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h2 className="text-[15px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>{s.title}</h2>
                    <ChannelPill primary={s.primary_channel} secondary={s.secondary_channel} />
                  </div>
                  <p className="text-[12.5px] text-muted mt-0.5">{s.tagline}</p>
                  <p className="text-[14px] text-foreground mt-3 leading-relaxed">{s.summary}</p>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {s.demonstrates.slice(0, 6).map(d => (
                      <span key={d} className="src-chip">
                        {d}
                      </span>
                    ))}
                  </div>

                  <details className="mt-3 group">
                    <summary className="text-[12px] text-muted cursor-pointer hover:text-foreground select-none">
                      Opening question (verbatim) →
                    </summary>
                    <blockquote className="mt-2 text-[13px] text-text-2 answer-block italic leading-relaxed">
                      {s.opening_question}
                    </blockquote>
                  </details>

                  <details className="mt-2">
                    <summary className="text-[12px] text-muted cursor-pointer hover:text-foreground select-none">
                      Video treatment →
                    </summary>
                    <p className="mt-2 text-[12.5px] text-muted leading-relaxed">{s.video_treatment}</p>
                  </details>
                </div>
                <div className="shrink-0">
                  <button
                    onClick={() => play(s.slug)}
                    disabled={playingSlug === s.slug}
                    className="btn-primary px-4 py-2 rounded-full text-sm font-medium inline-flex items-center gap-1.5 shadow-sm"
                  >
                    {playingSlug === s.slug ? (
                      <span>Loading…</span>
                    ) : (
                      <>
                        <PlayIcon />
                        <span>Play</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 card-soft p-5">
          <h3 className="hd">Production notes</h3>
          <ul className="mt-2 text-[13px] text-foreground space-y-1.5">
            {Object.entries(manifest.production_notes).map(([k, v]) => (
              <li key={k} className="flex gap-2">
                <span className="text-muted shrink-0 w-44 font-medium">{prettyKey(k)}</span>
                <span className="text-foreground">
                  {Array.isArray(v) ? (
                    <ul className="list-disc list-inside space-y-0.5">
                      {(v as string[]).map(item => <li key={item}>{item}</li>)}
                    </ul>
                  ) : String(v)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ChannelPill({ primary, secondary }: { primary: string; secondary: string | null }) {
  const label = secondary ? `${primary} + ${secondary}` : primary;
  return (
    <span className="check-pill ok">
      {label}
    </span>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function prettyKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
