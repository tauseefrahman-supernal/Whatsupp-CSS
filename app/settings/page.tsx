import { Suspense } from "react";
import { SettingsView } from "@/components/SettingsView";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading settings…</div>}>
      <SettingsView />
    </Suspense>
  );
}
