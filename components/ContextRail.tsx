"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { initials, avatarGradient } from "@/lib/avatar";

interface AthleteRow {
  id: string;
  name: string;
  sex?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  sport?: string | null;
  level?: string | null;
  profile_json?: string | null;
  profile?: Record<string, unknown> | null;
}

interface ProtocolEntry {
  id: string;
  supplement: string;
  event: string;
  created_at: number;
  data?: { title?: string; sessions?: unknown[] } | null;
}

/** Static demo card — matches the deck's "connected apps" slide. No real integration. */
const CONNECTED_APPS = [
  { name: "Garmin Connect", letter: "G", bg: "#67E8F9", live: true },
  { name: "Strava Premium", letter: "S", bg: "#FCA5A5", live: true },
  { name: "Zwift", letter: "Z", bg: "#FCD34D", live: true },
  { name: "Whoop", letter: "W", bg: "#C8D1DD", live: false },
];

export function ContextRail({ athleteId }: { athleteId: string }) {
  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [trial, setTrial] = useState<{ protocol: ProtocolEntry; total: number; logged: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Generation guard: a stale in-flight load (older athleteId or superseded
  // refresh) must not overwrite newer state.
  const loadGenRef = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    const gen = ++loadGenRef.current;
    if (reset) {
      setLoaded(false);
      setAthlete(null);
      setTrial(null);
    }

    try {
      const [aRes, pRes] = await Promise.all([
        fetch(`/api/athletes/${athleteId}`, { cache: "no-store" }),
        fetch(`/api/protocols?athleteId=${athleteId}`, { cache: "no-store" }),
      ]);
      if (gen !== loadGenRef.current) return;

      if (aRes.ok) {
        const data = await aRes.json();
        if (gen === loadGenRef.current) setAthlete(data.athlete ?? null);
      }

      if (pRes.ok) {
        const data = await pRes.json();
        const protocols = (data.protocols ?? []) as ProtocolEntry[];
        if (protocols.length > 0) {
          // Latest protocol = the active trial
          const latest = [...protocols].sort((a, b) => b.created_at - a.created_at)[0];
          const total = latest.data?.sessions?.length ?? 0;
          let logged = 0;
          try {
            const dRes = await fetch(`/api/protocols/${latest.id}`, { cache: "no-store" });
            if (dRes.ok) {
              const detail = await dRes.json();
              const seen = new Set((detail.logs ?? []).map((l: { session_idx: number }) => l.session_idx));
              logged = seen.size;
            }
          } catch { /* leave logged at 0 */ }
          if (gen === loadGenRef.current) setTrial({ protocol: latest, total, logged });
        } else if (gen === loadGenRef.current) {
          setTrial(null);
        }
      }
    } finally {
      if (gen === loadGenRef.current) setLoaded(true);
    }
  }, [athleteId]);

  useEffect(() => {
    load(true);
  }, [load]);

  // Refresh in place (no flicker) when the chat reports that George learned
  // something — profile_updates applied or a protocol persisted.
  useEffect(() => {
    const onRefresh = () => { load(false); };
    window.addEventListener("whatsupp:context-refresh", onRefresh);
    return () => window.removeEventListener("whatsupp:context-refresh", onRefresh);
  }, [load]);

  const profileFacts = athleteProfileFacts(athlete);

  return (
    <aside className="hidden xl:block w-[296px] shrink-0 border-l border-border bg-bg-1 overflow-y-auto px-[18px] py-5">
      {/* Athlete profile */}
      <div className="ctx-card mb-3.5">
        <div className="hd mb-3">Athlete profile</div>
        {athlete ? (
          <>
            <div className="flex items-center gap-[11px] mb-3">
              <div
                className="w-10 h-10 rounded-full grid place-items-center text-[14px] font-semibold text-bg-0 shrink-0"
                style={{ background: avatarGradient(athlete.name), fontFamily: "var(--font-display)" }}
              >
                {initials(athlete.name)}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate" style={{ fontFamily: "var(--font-display)" }}>
                  {athlete.name}
                </div>
                <div className="text-[11px] text-muted truncate">
                  {[athlete.age, athlete.sex, athlete.level].filter(Boolean).join(" · ") || "Profile building…"}
                </div>
              </div>
            </div>
            {athlete.sport && (
              <div className="kv"><span className="k">Sport</span><span className="v">{athlete.sport}</span></div>
            )}
            {athlete.weight_kg != null && (
              <div className="kv"><span className="k">Weight</span><span className="v">{athlete.weight_kg} kg</span></div>
            )}
            {profileFacts.map(([k, v]) => (
              <div className="kv" key={k}>
                <span className="k">{humanise(k)}</span>
                <span className="v hl">{String(v)}</span>
              </div>
            ))}
            {!athlete.sport && profileFacts.length === 0 && (
              <div className="text-[11.5px] text-text-4 leading-relaxed">
                George learns as you talk — sport, events, sensitivities and history will appear here.
              </div>
            )}
          </>
        ) : (
          <div className="text-[11.5px] text-text-4">{loaded ? "No athlete selected." : "Loading…"}</div>
        )}
      </div>

      {/* Active trial */}
      <div className="ctx-card mb-3.5">
        <div className="hd mb-3 flex items-center justify-between">
          Active trial
          {trial && trial.total > 0 && (
            <span className="check-pill ok normal-case">{trial.logged} / {trial.total}</span>
          )}
        </div>
        {trial ? (
          <Link href={`/protocols/${trial.protocol.id}?a=${athleteId}`} className="block group">
            <div
              className="text-[13px] font-semibold text-foreground group-hover:text-lime transition-colors"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {trial.protocol.data?.title ?? `${trial.protocol.supplement} × ${trial.protocol.event}`}
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              {trial.protocol.supplement} · {trial.protocol.event}
            </div>
            <div className="bar-track my-2.5">
              <div
                className="bar-fill"
                style={{ width: trial.total > 0 ? `${Math.min(100, (trial.logged / trial.total) * 100)}%` : "0%" }}
              />
            </div>
            <div
              className="flex justify-between text-[10px] text-muted"
              style={{ fontFamily: "var(--font-mono-deck)" }}
            >
              <span>Session {Math.min(trial.logged + 1, trial.total)} of {trial.total}</span>
              <span className="text-lime">{trial.logged > 0 ? "in flight" : "ready to start"}</span>
            </div>
          </Link>
        ) : (
          <div className="text-[11.5px] text-text-4 leading-relaxed">
            {loaded ? (
              <>No active trial — ask George to design an N-of-1 self-test for you.</>
            ) : (
              "Loading…"
            )}
          </div>
        )}
      </div>

      {/* Connected apps — static demo (deck slide 19) */}
      <div className="ctx-card">
        <div className="hd mb-2">Connected apps</div>
        {CONNECTED_APPS.map(app => (
          <div className="app-row" key={app.name}>
            <div
              className="w-[26px] h-[26px] rounded-[7px] shrink-0 grid place-items-center text-[11px] font-bold text-bg-0"
              style={{ background: app.bg, fontFamily: "var(--font-display)" }}
            >
              {app.letter}
            </div>
            <div className="text-[12px] font-medium text-text-2 flex-1">{app.name}</div>
            <span className={["sync-tag", app.live ? "" : "off"].join(" ")}>
              {app.live ? "live" : "connect"}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/** Pull up to 4 short learned facts out of the athlete's profile JSON. */
function athleteProfileFacts(athlete: AthleteRow | null): Array<[string, unknown]> {
  if (!athlete) return [];
  let profile: Record<string, unknown> | null = null;
  if (athlete.profile && typeof athlete.profile === "object") {
    profile = athlete.profile;
  } else if (athlete.profile_json) {
    try { profile = JSON.parse(athlete.profile_json); } catch { profile = null; }
  }
  if (!profile) return [];
  return Object.entries(profile)
    .filter(([k]) => !k.startsWith("demo_scenario")) // internal plumbing — never show
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .filter(([, v]) => String(v).length <= 40)
    .slice(0, 4);
}

function humanise(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/^\w/, c => c.toUpperCase());
}
