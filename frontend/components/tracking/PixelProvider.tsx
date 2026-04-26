"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/tracking";

function shouldTrackPageView(pathname: string | null): boolean {
  if (!pathname) return false;
  return !pathname.startsWith("/admin");
}

export default function PixelProvider() {
  const pathname = usePathname();

  // Fire PageView on storefront route changes only.
  useEffect(() => {
    if (!shouldTrackPageView(pathname)) return;

    // Small delay so the page content is ready
    const timer = setTimeout(() => {
      trackPageView();
    }, 300);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
