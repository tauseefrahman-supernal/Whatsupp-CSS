"use client";

import { initials, avatarGradient } from "@/lib/avatar";

export interface ExpertInfo {
  id: string;
  name: string;
  affiliation?: string;
  domains?: string[];
  bio?: string;
}

/** One threaded reply in the Wise Crowd conversation — avatar, credential pill,
 *  affiliation line, response body. Pure presentational. */
export function ExpertReply({
  expert,
  response,
  chair,
}: {
  expert: ExpertInfo;
  response: string;
  chair?: boolean;
}) {
  return (
    <div className="expert-reply border-t border-line pt-4 mt-4 rise-in">
      <div
        className="x-avatar w-9 h-9 text-[12px]"
        style={{ background: avatarGradient(expert.name) }}
      >
        {initials(expert.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-foreground flex items-center gap-2 flex-wrap">
          {expert.name}
          <span className="cred">{chair ? "Chair · Science panel" : "Panel"}</span>
        </div>
        {(expert.affiliation || expert.domains?.length) && (
          <div className="text-[11px] text-text-4 mt-px mb-2">
            {[expert.domains?.slice(0, 2).join(" · "), expert.affiliation].filter(Boolean).join(" · ")}
          </div>
        )}
        <div className="text-[13px] text-text-2 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          {response}
        </div>
      </div>
    </div>
  );
}

/** The "expert is typing" placeholder row shown during the staggered reveal. */
export function ExpertTyping({ expert }: { expert: ExpertInfo }) {
  return (
    <div className="expert-reply border-t border-line pt-4 mt-4 opacity-65">
      <div
        className="x-avatar w-9 h-9 text-[12px]"
        style={{ background: avatarGradient(expert.name) }}
      >
        {initials(expert.name)}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-foreground">{expert.name}</div>
        <div className="text-[11px] text-text-4 mt-px">drafting response</div>
        <div className="typing pt-1.5"><i /><i /><i /></div>
      </div>
    </div>
  );
}
