"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { AthletePicker } from "./AthletePicker";

const NAV = [
  { href: "/george", label: "George", desc: "Chat" },
  { href: "/onboarding", label: "Onboarding", desc: "Meet George" },
  { href: "/scenarios", label: "Demo Scenarios", desc: "Four canonical films" },
  { href: "/profile", label: "Profile", desc: "Athlete context" },
  { href: "/history", label: "History", desc: "Conversations" },
  { href: "/protocols", label: "Protocols", desc: "N-of-1 self-test" },
  { href: "/wotc", label: "Wise Crowd", desc: "Expert escalation" },
  { href: "/settings", label: "Settings", desc: "Voice, vault, status" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col">
      {/* Wordmark — WA-teal banner */}
      <div className="wa-rail-header px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Image
            src="/whatsupp-logo.svg"
            alt=""
            width={32}
            height={32}
            priority
            className="drop-shadow-sm"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-[17px] font-semibold tracking-tight text-white">
              What<span className="text-[#F5E9FF]">Supp</span>
            </span>
            <span className="text-[10px] text-white/60 uppercase tracking-wider -mt-0.5">
              AI Supplement Counsel · beta
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV.map(item => {
          const active = pathname === item.href || (item.href !== "/george" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block px-3 py-2 mb-0.5 rounded-md text-sm transition-colors relative",
                active
                  ? "bg-brand-soft text-foreground nav-active-bar"
                  : "text-muted hover:text-foreground hover:bg-surface-2/60",
              ].join(" ")}
            >
              <div className={["font-medium", active ? "text-foreground" : ""].join(" ")}>{item.label}</div>
              <div className="text-[11px] text-muted/80 -mt-0.5">{item.desc}</div>
            </Link>
          );
        })}
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
