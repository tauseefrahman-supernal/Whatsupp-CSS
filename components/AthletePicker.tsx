"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Athlete {
  id: string;
  name: string;
  sport?: string | null;
  context?: string | null;
  profile?: Record<string, unknown>;
}

const STORAGE_KEY = "whatsupp.athleteId";

export function AthletePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

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

  // Initialise selection if none chosen
  useEffect(() => {
    if (!loading && !currentId && athletes.length > 0) {
      selectAthlete(athletes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, athletes, currentId]);

  function selectAthlete(id: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("a", id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/athletes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const data = await res.json();
    await refresh();
    setNewName("");
    setCreating(false);
    selectAthlete(data.athlete.id);
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5 px-1">Athlete</div>

      <div className="space-y-0.5">
        {loading && <div className="text-xs text-muted px-2 py-1.5">Loading…</div>}

        {!loading && athletes.map(a => {
          const active = a.id === currentId;
          return (
            <button
              key={a.id}
              onClick={() => selectAthlete(a.id)}
              className={[
                "w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "hover:bg-surface-2 text-foreground",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium truncate">{a.name}</span>
                {a.sport && (
                  <span className={["text-[10px] truncate", active ? "text-brand-foreground/75" : "text-muted"].join(" ")}>
                    {firstWord(a.sport)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* New athlete */}
      <div className="mt-2 pt-2 border-t border-border">
        {creating ? (
          <div className="flex gap-1">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setCreating(false); setNewName(""); }
              }}
              placeholder="Your name"
              className="flex-1 min-w-0 px-2 py-1 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/15"
            />
            <button
              onClick={handleCreate}
              className="px-2 py-1 text-xs rounded-md btn-primary"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full text-left px-2.5 py-1.5 rounded-md text-sm text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            + New athlete
          </button>
        )}
      </div>
    </div>
  );
}

function firstWord(s: string): string {
  return s.split(/[\s(]+/)[0] ?? s;
}
