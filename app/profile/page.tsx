import { Suspense } from "react";
import { ProfileView } from "@/components/ProfileView";

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading profile…</div>}>
      <ProfileView />
    </Suspense>
  );
}
