import { Suspense } from "react";
import { ProtocolsView } from "@/components/ProtocolsView";

export default function ProtocolsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>
      <ProtocolsView />
    </Suspense>
  );
}
