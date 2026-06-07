"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MD = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-[15px] font-semibold text-foreground mt-4 mb-1.5 first:mt-0" style={{ fontFamily: "var(--font-display)" }} {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-[15px] font-semibold text-foreground mt-4 mb-1.5 first:mt-0" style={{ fontFamily: "var(--font-display)" }} {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-[13.5px] font-semibold text-foreground mt-3 mb-1 first:mt-0" style={{ fontFamily: "var(--font-display)" }} {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-2 last:mb-0 [overflow-wrap:anywhere]" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-outside pl-5 mb-2 last:mb-0 space-y-0.5" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-outside pl-5 mb-2 last:mb-0 space-y-0.5" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="my-2 max-w-full overflow-x-auto rounded-lg border border-line bg-bg-2/60">
      <table className="text-[12.5px] border-collapse" {...props} />
    </div>
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="text-left font-semibold text-foreground px-2.5 py-1.5 bg-bg-3/70 border-b border-line" {...props} />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-2.5 py-1.5 border-b border-line align-top" {...props} />
  ),
  hr: () => <hr className="my-3 border-line" />,
};

/** Lime gradient consensus banner — the Wise Crowd's synthesized verdict. */
export function VerdictBanner({
  consensus,
  responded,
  total,
}: {
  consensus: string;
  responded: number;
  total: number;
}) {
  return (
    <div className="verdict-card rise-in">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <span className="verdict-tag">
          Crowd consensus
        </span>
        <span className="hd !text-[9.5px]">
          {responded} / {total} experts · synthesised by George
        </span>
      </div>
      <div className="text-[13.5px] text-text-2 leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
          {consensus}
        </ReactMarkdown>
      </div>
    </div>
  );
}
