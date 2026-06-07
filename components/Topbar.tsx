"use client";

import { usePathname } from "next/navigation";

const CRUMBS: Record<string, { section: string; page: string }> = {
  "/george": { section: "Athlete", page: "George" },
  "/protocols": { section: "Athlete", page: "N-of-1 Trials" },
  "/wotc": { section: "Athlete", page: "Wise Crowd" },
  "/scenarios": { section: "Demo", page: "Scenarios" },
  "/onboarding": { section: "Demo", page: "Onboarding" },
  "/profile": { section: "Context", page: "Profile" },
  "/history": { section: "Context", page: "History" },
  "/settings": { section: "Context", page: "Settings" },
};

function crumbFor(pathname: string | null) {
  if (!pathname) return CRUMBS["/george"];
  const match = Object.keys(CRUMBS)
    .sort((a, b) => b.length - a.length)
    .find(href => pathname === href || pathname.startsWith(href + "/"));
  return match ? CRUMBS[match] : CRUMBS["/george"];
}

export function Topbar() {
  const pathname = usePathname();
  const crumb = crumbFor(pathname);

  return (
    <div className="h-[58px] shrink-0 border-b border-border bg-bg-1/60 backdrop-blur-md flex items-center px-6 gap-4">
      <div className="hd !text-[10px] tracking-[0.16em]">
        {crumb.section} / <span className="text-lime">{crumb.page}</span>
      </div>
      <div className="ml-auto live-pill">
        <span className="live-dot" /> Expert network live
      </div>
      <button className="btn-ghost text-xs font-medium px-4 py-2 rounded-lg" style={{ fontFamily: "var(--font-display)" }}>
        Export to coach
      </button>
    </div>
  );
}
