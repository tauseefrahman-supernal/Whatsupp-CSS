"use client";

import { initials, avatarGradient } from "@/lib/avatar";
import type { ExpertInfo } from "./ExpertReply";

export type RosterStatus = "invited" | "typing" | "replied" | "declined";

const STATUS_LABEL: Record<RosterStatus, string> = {
  invited: "invited",
  typing: "typing…",
  replied: "replied",
  declined: "declined",
};

/** Right-rail science-panel roster — shows each expert's live status during a
 *  Wise Crowd consultation (invited → typing… → replied). */
export function PanelRoster({
  experts,
  statuses,
  chairId,
}: {
  experts: ExpertInfo[];
  statuses: Record<string, RosterStatus>;
  chairId?: string;
}) {
  return (
    <div className="panel px-5 py-[18px]">
      <div className="hd mb-4">Science panel · {experts.length} experts</div>
      {experts.map((e, i) => {
        const status = statuses[e.id] ?? "invited";
        return (
          <div
            key={e.id}
            className={[
              "flex items-center gap-[11px] py-2",
              i > 0 ? "border-t border-line" : "",
            ].join(" ")}
          >
            <div
              className="x-avatar w-[30px] h-[30px] text-[10px]"
              style={{ background: avatarGradient(e.name) }}
            >
              {initials(e.name)}
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground truncate">{e.name}</div>
              <div className="text-[10.5px] text-text-4 truncate">
                {e.id === chairId ? "Chair · most-cited in field" : e.domains?.slice(0, 2).join(" · ") ?? ""}
              </div>
            </div>
            <span
              className={[
                "m-status",
                status === "replied" || status === "typing" ? "m-on" : "m-idle",
              ].join(" ")}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
