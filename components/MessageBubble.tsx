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
  onCompare?: () => void;
  onWiseCrowd?: () => void;
}

export function MessageBubble({ message, onCompare, onWiseCrowd }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end pr-3">
        <div className="bubble-out max-w-[78%] px-3 py-2 text-[14.5px] leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap">
          {message.content}
          <span className="bubble-meta float-right ml-2 mt-1 select-none">
            <Ticks />
          </span>
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
    <div className="group flex flex-col gap-1.5 pl-3">
      <div className="flex items-start gap-2 min-w-0">
        <div className="shrink-0 mt-0.5">
          <GeorgeAvatar />
        </div>
        <div className="flex flex-col gap-1 max-w-[82%] min-w-0 flex-1">
          <div className="bubble-in px-3 py-2 text-[14.5px] leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] george-md min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[12px] font-semibold text-george">George</span>
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-brand text-brand-foreground hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <span>Organise a Wise Crowd</span>
                  <span>→</span>
                </button>
              )}
              {onCompare && !message.streaming && (
                <button
                  onClick={onCompare}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-muted hover:text-foreground hover:bg-surface-2 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="See how generic AI would answer the same question"
                >
                  <span>Compare with ChatGPT &amp; Claude</span>
                  <span>↗</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Light-touch markdown renderer — preserves WhatsApp chat aesthetic, no headings as
 *  block-level rules, lists styled inline, tables get a horizontal scroll container.
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
    <strong className="font-semibold" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic text-foreground/85" {...props} />
  ),
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="font-semibold mb-1 [overflow-wrap:anywhere]" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="font-semibold mb-1 [overflow-wrap:anywhere]" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="font-semibold mb-1 [overflow-wrap:anywhere]" {...props} />
  ),
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="my-2 max-w-full overflow-x-auto rounded-md border border-border/60 bg-surface-2/40">
      <table className="text-[13px] border-collapse" {...props} />
    </div>
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="text-left font-semibold px-2.5 py-1.5 bg-surface-2/70 border-b border-border/60 [overflow-wrap:anywhere]" {...props} />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-2.5 py-1.5 border-b border-border/40 align-top [overflow-wrap:anywhere]" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="px-1 py-0.5 rounded bg-surface-2 text-[13px] [overflow-wrap:anywhere]" {...props} />
  ),
  hr: () => (
    <hr className="my-2 border-border/60" />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-brand hover:underline [overflow-wrap:anywhere]" {...props} />
  ),
};

/** Inline rich-render of a structured self-test protocol — emitted by George via meta
 *  when he wants to hand off to the Protocols workspace. */
function ProtocolCard({ payload }: { payload: ProtocolCardPayload }) {
  const sessions = payload.sessions ?? [];
  const logVars = payload.log_variables ?? [];
  return (
    <div className="mt-1 rounded-lg border border-brand-soft-border bg-brand-soft/40 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-brand-soft-border bg-white/60">
        <div className="flex items-center gap-2">
          <span className="inline-flex w-5 h-5 rounded-full bg-brand text-white items-center justify-center text-[11px] font-semibold">P</span>
          <span className="text-[12px] uppercase tracking-wider text-brand-hover font-semibold">Protocol · N-of-1 self-test</span>
        </div>
        {payload.title && (
          <h3 className="text-[14.5px] font-semibold text-foreground mt-1.5 leading-snug">{payload.title}</h3>
        )}
        {payload.rationale && (
          <p className="text-[12.5px] text-muted mt-1 leading-snug">{payload.rationale}</p>
        )}
      </div>
      {sessions.length > 0 && (
        <div className="max-w-full overflow-x-auto bg-white/50">
          <table className="text-[12.5px] w-full border-collapse">
            <thead>
              <tr className="bg-surface-2/60 text-muted">
                <th className="text-left font-semibold px-3 py-1.5 border-b border-border/60">Session</th>
                <th className="text-left font-semibold px-3 py-1.5 border-b border-border/60">Workout</th>
                <th className="text-left font-semibold px-3 py-1.5 border-b border-border/60">Focus</th>
                <th className="text-left font-semibold px-3 py-1.5 border-b border-border/60">Question</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.session} className="align-top">
                  <td className="px-3 py-1.5 border-b border-border/40 font-semibold text-foreground">{s.session}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 [overflow-wrap:anywhere]">{s.workout}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 [overflow-wrap:anywhere]">{s.focus}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 text-muted [overflow-wrap:anywhere]">{s.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {logVars.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border/60 bg-white/40">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-1">Log each session</div>
          <div className="flex flex-wrap gap-1">
            {logVars.map((v) => (
              <span key={v} className="text-[11.5px] px-1.5 py-0.5 rounded border border-border/60 bg-surface-2/60 [overflow-wrap:anywhere]">{v}</span>
            ))}
          </div>
        </div>
      )}
      {payload.bottom_line && (
        <div className="px-4 py-2.5 border-t border-border/60 bg-white/30 text-[12.5px] text-foreground/85 italic leading-snug">
          {payload.bottom_line}
        </div>
      )}
      {payload.cta_url && (
        <div className="px-4 py-2.5 border-t border-border/60 bg-brand-soft/60">
          <Link
            href={payload.cta_url}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-hover hover:text-brand"
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
      className="w-8 h-8 rounded-full bg-brand text-white text-[12px] font-semibold flex items-center justify-center shadow-sm"
      aria-label="George"
      title="George — AI Supplement Counsel"
    >
      G
    </div>
  );
}

function ConfidencePill({ level }: { level: string }) {
  const norm = level.toLowerCase();
  const color =
    norm === "high"     ? "bg-confidence-high/10 text-confidence-high border-confidence-high/30" :
    norm === "moderate" ? "bg-confidence-moderate/10 text-confidence-moderate border-confidence-moderate/30" :
    norm === "low"      ? "bg-confidence-low/10 text-confidence-low border-confidence-low/30" :
                          "bg-surface-2 text-muted border-border";
  return (
    <span className={["text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium", color].join(" ")}>
      {norm} confidence
    </span>
  );
}

function BlinkingCursor() {
  return <span className="inline-block w-[2px] h-[1em] -mb-[2px] ml-0.5 bg-foreground/60 animate-pulse" aria-hidden />;
}

function Ticks() {
  return (
    <svg
      viewBox="0 0 16 11"
      width="14"
      height="10"
      fill="none"
      aria-hidden
      className="inline-block align-middle opacity-70"
    >
      <path d="M11.071.65l-4.6 5.46c-.27.32-.78.32-1.05 0L3.07 3.41" stroke="#53bdeb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M15.071.65l-4.6 5.46c-.27.32-.78.32-1.05 0L7.07 3.41" stroke="#53bdeb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
