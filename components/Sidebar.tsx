"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AthletePicker } from "./AthletePicker";

type NavItem = { href: string; label: string; desc: string; icon: React.ReactNode };
type NavSection = { label: string; items: NavItem[] };

const ICONS = {
  chat: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-6" />
    </>
  ),
  crowd: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5l5 3.5-5 3.5v-7z" />
    </>
  ),
  wave: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
};

const SECTIONS: NavSection[] = [
  {
    label: "Athlete",
    items: [
      { href: "/george", label: "George", desc: "Expert AI conversation", icon: ICONS.chat },
      { href: "/protocols", label: "N-of-1 Trials", desc: "Be a study of you", icon: ICONS.chart },
      { href: "/wotc", label: "Wise Crowd", desc: "Expert escalation", icon: ICONS.crowd },
    ],
  },
  {
    label: "Context",
    items: [
      { href: "/profile", label: "Profile", desc: "Athlete context", icon: ICONS.user },
      { href: "/history", label: "History", desc: "Conversations", icon: ICONS.clock },
      { href: "/settings", label: "Settings", desc: "Voice · vault · status", icon: ICONS.gear },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Carry the selected athlete across page changes so no view ever asks again.
  const athleteId = searchParams.get("a");
  const withAthlete = (href: string) => (athleteId ? `${href}?a=${athleteId}` : href);

  return (
    <aside className="w-[248px] shrink-0 border-r border-border bg-bg-1 flex flex-col">
      {/* Wordmark */}
      <div className="px-5 pt-[22px] pb-[18px] border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="logo-dot w-[34px] h-[34px] text-[19px]">?</div>
          <div className="leading-tight">
            <div
              className="text-[17px] font-bold tracking-[0.04em] text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              WHATSUPP<span className="text-lime">?</span>
            </div>
            <div className="hd !text-[9px] tracking-[0.18em] mt-0.5">By George</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3.5">
        {SECTIONS.map((section, si) => (
          <div key={section.label} className={si > 0 ? "mt-4" : ""}>
            <div className="hd px-2.5 pb-2">{section.label}</div>
            {section.items.map(item => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={withAthlete(item.href)}
                  className={[
                    "flex items-center gap-[11px] px-2.5 py-2 mb-0.5 rounded-lg border transition-colors",
                    active
                      ? "bg-lime-glow border-[rgba(182,245,105,0.22)]"
                      : "border-transparent hover:bg-[rgba(244,247,251,0.04)]",
                  ].join(" ")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={["w-[17px] h-[17px] shrink-0 fill-none", active ? "stroke-lime" : "stroke-muted"].join(" ")}
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {item.icon}
                  </svg>
                  <div className="min-w-0">
                    <div className={["text-[13px] font-medium", active ? "text-foreground" : "text-text-2"].join(" ")}>
                      {item.label}
                    </div>
                    <div className="text-[10.5px] text-text-4 mt-px truncate">{item.desc}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Athlete picker */}
      <div className="border-t border-border p-3">
        <Suspense fallback={<div className="text-xs text-muted px-2 py-1.5">Loading…</div>}>
          <AthletePicker />
        </Suspense>
      </div>
    </aside>
  );
}
