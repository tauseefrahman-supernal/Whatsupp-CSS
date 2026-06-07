"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { initials, avatarGradient } from "@/lib/avatar";

interface Athlete {
  id: string;
  name: string;
  sport?: string | null;
  context?: string | null;
  profile?: Record<string, unknown>;
}

const STORAGE_KEY = "whatsupp.athleteId";

/** The demo cast — the only profiles the switcher offers.
 *  Mia → scenarios 1+2 (one flow) · Matt → scenario 3 · Percy → scenario 4. */
const CAST_IDS = ["mia-aflw", "kona-tom", "percy-racewalk"];

export function AthletePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const currentId = searchParams.get("a") ?? (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/athletes", { cache: "no-store" });
      const data = await res.json();
      setAthletes(data.athletes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The switchable roster: the three demo profiles plus anything created from
  // this picker (fall back to everything only if the seeds are somehow missing).
  const cast = athletes.filter(a => CAST_IDS.includes(a.id));
  const added = athletes.filter(a => !CAST_IDS.includes(a.id) && a.profile?.show_in_switcher === true);
  const roster = cast.length > 0 ? [...cast, ...added] : athletes;
  const current = athletes.find(a => a.id === currentId) ?? null;

  // Initialise selection if none chosen yet.
  useEffect(() => {
    if (!loading && !currentId && roster.length > 0) {
      selectAthlete(roster[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, roster.length, currentId]);

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function selectAthlete(id: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("a", id);
    // A different athlete means a different conversation — drop any deep-linked session.
    params.delete("s");
    router.replace(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, profile: { show_in_switcher: true } }),
      });
      if (!res.ok) return;
      const data = await res.json();
      await refresh();
      setNewName("");
      setCreating(false);
      selectAthlete(data.athlete.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(a: Athlete) {
    if (busy) return;
    if (!window.confirm(`Delete the profile "${a.name}" and all of its conversations? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/athletes/${a.id}`, { method: "DELETE" });
      if (!res.ok) return;
      await refresh();
      if (currentId === a.id) {
        const fallback = cast[0] ?? roster.find(r => r.id !== a.id);
        if (fallback) selectAthlete(fallback.id);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading && !current) {
    return <div className="text-xs text-muted px-2 py-1.5">Loading…</div>;
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Popover — opens upward, only when toggled */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-line-strong bg-bg-2 shadow-xl p-1.5 z-30">
          <div className="hd px-2 pt-1 pb-1.5">Switch profile</div>
          <div className="max-h-60 overflow-y-auto">
            {roster.map(a => {
              const active = a.id === currentId;
              const removable = !CAST_IDS.includes(a.id);
              return (
                <div
                  key={a.id}
                  className={[
                    "group flex items-center rounded-lg border transition-colors",
                    active
                      ? "bg-surface border-line-strong"
                      : "border-transparent hover:bg-[rgba(244,247,251,0.04)]",
                  ].join(" ")}
                >
                  <button
                    onClick={() => selectAthlete(a.id)}
                    className={["flex-1 min-w-0 text-left px-2 py-1.5 text-sm flex items-center gap-2.5", active ? "" : "text-text-2"].join(" ")}
                  >
                    <span
                      className="w-7 h-7 rounded-full shrink-0 grid place-items-center text-[11px] font-semibold text-bg-0"
                      style={{ background: avatarGradient(a.name), fontFamily: "var(--font-display)" }}
                    >
                      {initials(a.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={["block text-[12.5px] font-medium truncate", active ? "text-foreground" : ""].join(" ")}>
                        {a.name}
                      </span>
                      <span className="block text-[10px] text-text-4 truncate" style={{ fontFamily: "var(--font-mono-deck)" }}>
                        {a.sport ? firstWord(a.sport).toLowerCase() : "new profile"}
                      </span>
                    </span>
                    {active && <span className="live-dot shrink-0" />}
                  </button>
                  {removable && (
                    <button
                      onClick={() => handleDelete(a)}
                      disabled={busy}
                      className="px-2 py-1.5 text-[13px] text-text-4 hover:text-confidence-low opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      title={`Delete ${a.name} and all their conversations`}
                      aria-label={`Delete ${a.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* New profile */}
          <div className="mt-1.5 pt-1.5 border-t border-border">
            {creating ? (
              <div className="flex gap-1 px-1 pb-0.5">
                <input
                  autoFocus
                  value={newName}
                  disabled={busy}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  placeholder="Profile name"
                  className="field-dark flex-1 min-w-0 px-2 py-1 text-sm"
                />
                <button
                  onClick={handleCreate}
                  disabled={busy || !newName.trim()}
                  className="px-2.5 py-1 text-xs rounded-lg btn-primary"
                >
                  {busy ? "…" : "Add"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full text-left px-2 py-1.5 rounded-lg text-[12.5px] text-muted hover:text-foreground hover:bg-[rgba(244,247,251,0.04)] transition-colors"
              >
                + New profile
              </button>
            )}
          </div>
        </div>
      )}

      {/* Current profile — the only thing visible at rest */}
      <div className="hd mb-1.5 px-1">Profile</div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors border border-transparent hover:bg-[rgba(244,247,251,0.04)] flex items-center gap-2.5"
        title="Switch profile"
      >
        {current ? (
          <>
            <span
              className="w-8 h-8 rounded-full shrink-0 grid place-items-center text-[12px] font-semibold text-bg-0"
              style={{ background: avatarGradient(current.name), fontFamily: "var(--font-display)" }}
            >
              {initials(current.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-foreground truncate">{current.name}</span>
              <span className="block text-[10px] text-text-4 truncate" style={{ fontFamily: "var(--font-mono-deck)" }}>
                {current.sport ? firstWord(current.sport).toLowerCase() : "profile"}
              </span>
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-muted flex-1">Choose a profile…</span>
        )}
        <svg
          viewBox="0 0 24 24"
          className={["w-3.5 h-3.5 shrink-0 stroke-muted fill-none transition-transform", open ? "rotate-180" : ""].join(" ")}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 14l6-6 6 6" />
        </svg>
      </button>
    </div>
  );
}

function firstWord(s: string): string {
  return s.split(/[\s(]+/)[0] ?? s;
}
