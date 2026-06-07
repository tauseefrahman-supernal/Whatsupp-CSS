"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: Record<string, unknown>;
  streaming?: boolean;
}

interface ProtocolCardPayload {
  title?: string;
  rationale?: string;
  sessions?: Array<{ session: number; workout: string; focus: string; question: string }>;
  log_variables?: string[];
  bottom_line?: string;
  cta_url?: string;
  cta_label?: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  athleteName?: string;
  onCompare?: () => void;
  onWiseCrowd?: () => void;
}

export function MessageBubble({ message, athleteName, onCompare, onWiseCrowd }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end rise-in">
        <div className="bubble-out max-w-[78%] px-[17px] py-3 text-[13.5px] leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap">
          <div
            className="text-[9.5px] uppercase tracking-[0.16em] text-cyan mb-1.5"
            style={{ fontFamily: "var(--font-mono-deck)" }}
          >
            {athleteName ?? "You"}
          </div>
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant (George)
  const meta = message.meta;
  const confidence = (meta?.confidence_overall as string | undefined) ?? null;
  const wcCta = meta?.wise_crowd_cta === true;
  const protocolCard = (meta?.protocol_card as ProtocolCardPayload | undefined) ?? undefined;

  return (
    <div className="group flex flex-col gap-1.5 rise-in">
      <div className="flex items-start gap-3 min-w-0">
        <div className="shrink-0 mt-0.5">
          <GeorgeAvatar />
        </div>
        <div className="flex flex-col gap-1.5 max-w-[82%] min-w-0 flex-1">
          <div className="bubble-in px-[17px] py-3.5 text-[13.5px] leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] george-md min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className="text-[9.5px] uppercase tracking-[0.16em] text-lime"
                style={{ fontFamily: "var(--font-mono-deck)" }}
              >
                George · AI Sports Dietitian
              </span>
              {confidence && <ConfidencePill level={confidence} />}
            </div>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MD_COMPONENTS}
            >
              {message.content}
            </ReactMarkdown>
            {message.streaming && <BlinkingCursor />}
          </div>

          {protocolCard && !message.streaming && (
            <ProtocolCard payload={protocolCard} />
          )}

          {(wcCta || (onCompare && !message.streaming)) && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {wcCta && (
                <button
                  onClick={onWiseCrowd}
                  disabled={!onWiseCrowd}
                  className="action-chip"
                >
                  Ask the Wise Crowd ↗
                </button>
              )}
              {onCompare && !message.streaming && (
                <button
                  onClick={onCompare}
                  className="px-3 py-[7px] rounded-full text-[11.5px] font-medium text-muted border border-transparent hover:text-text-2 hover:border-line-strong transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="See how generic AI would answer the same question"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Compare with ChatGPT &amp; Claude ↗
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Markdown renderer tuned for the dark deck theme — no headings as block-level
 *  rules, lists styled inline, tables get a horizontal scroll container.
 *  Critical: every block sets min-w-0 and overflow-wrap so long content reflows. */
const MD_COMPONENTS = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-2 last:mb-0 [overflow-wrap:anywhere] [word-break:break-word]" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-outside pl-5 mb-2 last:mb-0 space-y-0.5" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-outside pl-5 mb-2 last:mb-0 space-y-0.5" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="[overflow-wrap:anywhere] [word-break:break-word]" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic text-muted" {...props} />
  ),
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="font-semibold text-foreground mb-1 [overflow-wrap:anywhere]" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="font-semibold text-foreground mb-1 [overflow-wrap:anywhere]" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="font-semibold text-foreground mb-1 [overflow-wrap:anywhere]" {...props} />
  ),
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="my-2 max-w-full overflow-x-auto rounded-lg border border-line bg-bg-3/40">
      <table className="text-[13px] border-collapse" {...props} />
    </div>
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="text-left font-semibold text-foreground px-2.5 py-1.5 bg-bg-3/70 border-b border-line [overflow-wrap:anywhere]" {...props} />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-2.5 py-1.5 border-b border-line align-top [overflow-wrap:anywhere]" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="px-1 py-0.5 rounded bg-bg-3 text-[12.5px] [overflow-wrap:anywhere]" {...props} />
  ),
  hr: () => (
    <hr className="my-2 border-line" />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-cyan hover:underline [overflow-wrap:anywhere]" {...props} />
  ),
};

/** Inline rich-render of a structured self-test protocol — emitted by George via meta
 *  when he wants to hand off to the Protocols workspace. */
function ProtocolCard({ payload }: { payload: ProtocolCardPayload }) {
  const sessions = payload.sessions ?? [];
  const logVars = payload.log_variables ?? [];
  return (
    <div className="mt-1 panel overflow-hidden">
      <div className="px-4 py-3 border-b border-line bg-bg-3/40">
        <div className="hd flex items-center gap-2">
          <span className="inline-flex w-4 h-4 rounded bg-lime text-bg-0 items-center justify-center text-[9px] font-bold not-italic">N</span>
          Protocol · N-of-1 self-test
        </div>
        {payload.title && (
          <h3
            className="text-[14.5px] font-semibold text-foreground mt-2 leading-snug"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {payload.title}
          </h3>
        )}
        {payload.rationale && (
          <p className="text-[12.5px] text-muted mt-1 leading-snug">{payload.rationale}</p>
        )}
      </div>
      {sessions.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <table className="text-[12.5px] w-full border-collapse">
            <thead>
              <tr className="bg-bg-3/60 text-muted">
                <th className="text-left font-semibold px-3 py-1.5 border-b border-line">Session</th>
                <th className="text-left font-semibold px-3 py-1.5 border-b border-line">Workout</th>
                <th className="text-left font-semibold px-3 py-1.5 border-b border-line">Focus</th>
                <th className="text-left font-semibold px-3 py-1.5 border-b border-line">Question</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.session} className="align-top text-text-2">
                  <td className="px-3 py-1.5 border-b border-line font-semibold text-lime" style={{ fontFamily: "var(--font-mono-deck)" }}>{s.session}</td>
                  <td className="px-3 py-1.5 border-b border-line [overflow-wrap:anywhere]">{s.workout}</td>
                  <td className="px-3 py-1.5 border-b border-line [overflow-wrap:anywhere]">{s.focus}</td>
                  <td className="px-3 py-1.5 border-b border-line text-muted [overflow-wrap:anywhere]">{s.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {logVars.length > 0 && (
        <div className="px-4 py-2.5 border-t border-line">
          <div className="hd mb-1.5">Log each session</div>
          <div className="flex flex-wrap gap-1">
            {logVars.map((v) => (
              <span key={v} className="text-[11px] px-2 py-0.5 rounded-full border border-line bg-bg-3 text-text-2 [overflow-wrap:anywhere]">{v}</span>
            ))}
          </div>
        </div>
      )}
      {payload.bottom_line && (
        <div className="mx-4 my-3 answer-block">
          <div className="k">Bottom line</div>
          <div className="text-[12.5px] text-foreground leading-snug">{payload.bottom_line}</div>
        </div>
      )}
      {payload.cta_url && (
        <div className="px-4 py-2.5 border-t border-line bg-lime-glow/50">
          <Link
            href={payload.cta_url}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-lime hover:brightness-110"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span>{payload.cta_label ?? "Open in Protocols workspace"}</span>
            <span>→</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function GeorgeAvatar() {
  return (
    <div
      className="w-[34px] h-[34px] rounded-[10px] text-bg-0 text-[15px] font-bold flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, var(--lime), var(--lime-deep))",
        fontFamily: "var(--font-display)",
      }}
      aria-label="George"
      title="George — AI Sports Dietitian"
    >
      G
    </div>
  );
}

function ConfidencePill({ level }: { level: string }) {
  const norm = level.toLowerCase();
  const cls =
    norm === "high"     ? "conf-high" :
    norm === "moderate" ? "conf-mod" :
    norm === "low"      ? "conf-low" :
                          "";
  return (
    <span className={["conf-badge ml-auto", cls].join(" ")}>
      {norm} confidence
    </span>
  );
}

function BlinkingCursor() {
  return <span className="inline-block w-[2px] h-[1em] -mb-[2px] ml-0.5 bg-lime animate-pulse" aria-hidden />;
}
