import { Suspense } from "react";
import { ChatPanel } from "@/components/ChatPanel";

export default function GeorgePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading George…</div>}>
      <ChatPanel />
    </Suspense>
  );
}
