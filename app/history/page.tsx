import { Suspense } from "react";
import { HistoryView } from "@/components/HistoryView";

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading history…</div>}>
      <HistoryView />
    </Suspense>
  );
}
