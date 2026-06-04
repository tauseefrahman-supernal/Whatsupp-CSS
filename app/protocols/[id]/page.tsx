import { Suspense } from "react";
import { ProtocolDetailView } from "@/components/ProtocolDetailView";

export default async function ProtocolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading protocol…</div>}>
      <ProtocolDetailView protocolId={id} />
    </Suspense>
  );
}
