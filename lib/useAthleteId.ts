"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "whatsupp.athleteId";

/**
 * The selected athlete follows you across pages. Resolution order:
 *   1. `?a=` in the URL (and we remember it),
 *   2. the remembered athlete from localStorage — in which case the URL is
 *      self-healed so links/refreshes keep the context.
 * Returns null only when no athlete has ever been selected.
 */
export function useAthleteId(): string | null {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = searchParams.get("a");
  const [stored, setStored] = useState<string | null>(null);

  // Hydration-safe read of the remembered athlete.
  useEffect(() => {
    try { setStored(localStorage.getItem(STORAGE_KEY)); } catch { /* private mode */ }
  }, []);

  // Remember URL selections; heal the URL when the param is missing.
  useEffect(() => {
    if (fromUrl) {
      try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch { /* ignore */ }
      if (fromUrl !== stored) setStored(fromUrl);
      return;
    }
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
    if (remembered) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("a", remembered);
      router.replace(`${pathname}?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl, pathname]);

  return fromUrl ?? stored;
}
