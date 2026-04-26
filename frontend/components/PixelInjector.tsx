/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-rest-params */
/* eslint-disable prefer-spread */
/* eslint-disable @typescript-eslint/no-unused-expressions */
"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import api, { APIResponse } from "@/lib/api";

export default function PixelInjector() {
  const [pixels, setPixels] = useState<{ meta: string; tiktok: string; metaTest: string; tiktokTest: string } | null>(null);

  useEffect(() => {
    // Stubs for early tracking events before the script is fully mounted
    if (typeof window !== "undefined") {
      if (!window.fbq) {
        window.fbq = function () {
          window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments);
        } as any;
        window.fbq.queue = [];
      }
      
      if (!window.ttq) {
        window.ttq = [] as any;
        window.ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
        window.ttq.setAndDefer = function (t: any, e: any) {
          t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); };
        };
        for (let i = 0; i < window.ttq.methods.length; i++) {
          window.ttq.setAndDefer(window.ttq, window.ttq.methods[i]);
        }
      }
    }

    // Fetch dynamic pixel IDs from the server
    // We prioritize Admin Panel settings, then fallback to .env variables
    api.get<APIResponse<Record<string, string>>>("/api/settings/public")
      .then(res => {
        const metaId = res.data?.meta_pixel_id || process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
        const tiktokId = res.data?.tiktok_pixel_id || process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "";
        const metaTest = res.data?.meta_test_code || "";
        const tiktokTest = res.data?.tiktok_test_code || "";
        
        console.log("[Pixels] Loaded configuration:", {
          meta: metaId ? "Present" : "Missing",
          tiktok: tiktokId ? "Present" : "Missing",
          apiSource: "database"
        });

        setPixels({
          meta: metaId,
          tiktok: tiktokId,
          metaTest,
          tiktokTest,
        });
      })
      .catch((err) => {
        console.error("[Pixels] Failed to fetch settings from API, using env fallbacks:", err);
        setPixels({
          meta: process.env.NEXT_PUBLIC_META_PIXEL_ID || "",
          tiktok: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "",
          metaTest: "",
          tiktokTest: "",
        });
      });
  }, []);

  if (!pixels) return null;

  return (
    <>
      <Script
        id="tiktok-base"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
              ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
              ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
              for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
              ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
              ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
            }(window, document, 'ttq');
          `,
        }}
      />

      {/* Manual Meta Pixel Script */}
      {pixels.meta && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${pixels.meta}');
            `,
          }}
        />
      )}

      {/* Manual TikTok Pixel Load call */}
      {pixels.tiktok && (
        <Script
          id="tiktok-load"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if (window.ttq && !window._ttq_loaded) {
                ttq.load('${pixels.tiktok}');
                ttq.page();
                window._ttq_loaded = true;
                console.log("[Pixels] TikTok Browser Pixel Initialized and PageView fired for ID: ${pixels.tiktok}");
              }
            `,
          }}
        />
      )}
    </>
  );
}
