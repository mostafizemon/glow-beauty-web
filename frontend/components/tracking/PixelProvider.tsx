"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/tracking";

export default function PixelProvider() {
  const pathname = usePathname();

  // Fire PageView on every route change
  useEffect(() => {
    // Small delay so the page content is ready
    const timer = setTimeout(() => {
      trackPageView();
    }, 300);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
