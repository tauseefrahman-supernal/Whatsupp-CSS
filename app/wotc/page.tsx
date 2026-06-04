import { Suspense } from "react";
import { WotcView } from "@/components/WotcView";

export default function WotcPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading Wise Crowd…</div>}>
      <WotcView />
    </Suspense>
  );
}
