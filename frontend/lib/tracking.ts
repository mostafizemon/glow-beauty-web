/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/tracking.ts — Dual pixel tracking: client-side + server-side bridge

import { v4 as uuidv4 } from "uuid";

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
// If API_URL is localhost but we are in production browser, use relative path to avoid bridge failure
const API_URL = (typeof window !== "undefined" && window.location.hostname !== "localhost" && NEXT_PUBLIC_API_URL.includes("localhost")) 
  ? "" 
  : NEXT_PUBLIC_API_URL;

declare global {
  interface Window {
    ttq: any;
    fbq: any;
    _ttq_loaded?: boolean;
    _fbq_loaded?: boolean;
    __tt_test_code?: string;
    __fb_test_code?: string;
  }
}

interface TrackContent {
  content_id: string;
  content_name: string;
  content_type: string;
  price: number;
  quantity: number;
}

interface UserData {
  phone?: string;
  email?: string;
  external_id?: string;
  ttclid?: string;
  [key: string]: unknown;
}

function ensureClientPixelQueues() {
  if (typeof window === "undefined") return;

  if (!window.fbq) {
    const fbqShim = function (...args: unknown[]) {
      if (fbqShim.callMethod) {
        fbqShim.callMethod(...args);
      } else {
        fbqShim.queue.push(args);
      }
    } as any;
    fbqShim.queue = [];
    window.fbq = fbqShim;
  }

  if (!window.ttq) {
    // If TikTok isn't loaded yet, we don't shim it here to avoid conflicts.
    // PixelInjector will handle the official TikTok initialization.
  }
}

function getCookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return "";
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined" || !value) return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

function captureTtclidFromUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ttclid = params.get("ttclid");
  if (ttclid) {
    // Keep click id for attribution on later events in the session window.
    setCookie("ttclid", ttclid, 60 * 60 * 24 * 30);
  }
}

function validValue(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

function buildTikTokProductPayload(contents: TrackContent[], value: number, currency: string) {
  const contentIds = contents.map((item) => item.content_id).filter(Boolean);
  const quantity = contents.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const normalizedValue = validValue(value);

  return {
    contents,
    content_ids: contentIds,
    content_type: "product",
    ...(quantity > 0 ? { quantity } : {}),
    ...(normalizedValue > 0 ? { value: normalizedValue, currency } : {}),
  };
}

function fireTikTokPageViewWhenReady(eventId: string, ttTestCode: string) {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const fire = () => {
      if (settled) return;
      settled = true;
      if (window.ttq && typeof window.ttq.page === "function") {
        window.ttq.page({
          event_id: eventId,
          ...(ttTestCode ? { test_event_code: ttTestCode } : {}),
        });
        resolve(true);
        return;
      }
      resolve(false);
    };

    if (window._ttq_loaded) {
      fire();
      return;
    }

    const onReady = () => fire();
    window.addEventListener("gbg:pixels-ready", onReady, { once: true });

    window.setTimeout(() => {
      window.removeEventListener("gbg:pixels-ready", onReady);
      fire();
    }, 5000);
  });
}

function fireMetaWhenReady(
  eventName: string,
  params: Record<string, unknown>,
  eventId: string
) {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const fire = () => {
      if (settled) return;
      settled = true;
      if (window.fbq && window._fbq_loaded) {
        window.fbq("track", eventName, params, { eventID: eventId });
        resolve(true);
        return;
      }
      resolve(false);
    };

    if (window._fbq_loaded) {
      fire();
      return;
    }

    const onReady = () => fire();
    window.addEventListener("gbg:meta-ready", onReady, { once: true });

    window.setTimeout(() => {
      window.removeEventListener("gbg:meta-ready", onReady);
      fire();
    }, 5000);
  });
}

// Send to backend tracking bridge
async function sendServerEvent(
  eventName: string,
  eventId: string,
  data: {
    pageUrl?: string;
    userData?: UserData;
    contents?: TrackContent[];
    value?: number;
    currency?: string;
  }
) {
  try {
    captureTtclidFromUrl();
    const fbp = getCookieValue("_fbp");
    const fbc = getCookieValue("_fbc");
    const ttclid = getCookieValue("ttclid");
    const mergedUserData: UserData = {
      ...(data.userData || {}),
      ...(fbp ? { fbp } : {}),
      ...(fbc ? { fbc } : {}),
      ...(ttclid ? { ttclid } : {}),
    };

    await fetch(`${API_URL}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        page_url: data.pageUrl || (typeof window !== "undefined" ? window.location.href : ""),
        user_data: mergedUserData,
        contents: data.contents || [],
        value: data.value || 0,
        currency: data.currency || "BDT",
      }),
    });
  } catch {
    // Silently fail — tracking should never break the app
    console.warn(`[Tracking] Failed to send ${eventName} to server`);
  }
}

export function trackPageView() {
  if (typeof window !== "undefined") {
    ensureClientPixelQueues();

    // Prevent duplicate PageView fires for the same URL in a short window.
    const dedupKey = `__gbg_pageview__${window.location.pathname}${window.location.search}`;
    const now = Date.now();
    const lastTsRaw = window.sessionStorage.getItem(dedupKey);
    const lastTs = lastTsRaw ? Number(lastTsRaw) : 0;
    if (Number.isFinite(lastTs) && now-lastTs < 1500) {
      return;
    }
    window.sessionStorage.setItem(dedupKey, String(now));
  }

  const eventId = uuidv4();
  const ttTestCode = typeof window !== "undefined" ? window.__tt_test_code : "";

  if (typeof window !== "undefined") {
    void fireTikTokPageViewWhenReady(eventId, ttTestCode || "");
    void fireMetaWhenReady("PageView", {}, eventId);
  }

  sendServerEvent("PageView", eventId, {});
}

export function trackViewContent(
  product: { id: string; name: string; price: number; category?: string },
  userData?: UserData
) {
  ensureClientPixelQueues();
  const eventId = uuidv4();
  const ttTestCode = typeof window !== "undefined" ? (window as any).__tt_test_code : "";

  const contents: TrackContent[] = [
    {
      content_id: product.id,
      content_name: product.name,
      // TikTok expects standardized content_type values (e.g. "product").
      content_type: "product",
      price: product.price,
      quantity: 1,
    },
  ];

  // Client-side
  if (typeof window !== "undefined") {
    if (window.ttq)
      window.ttq.track(
        "ViewContent",
        buildTikTokProductPayload(contents, Number(product.price) || 0, "BDT"),
        { 
          event_id: eventId,
          ...(ttTestCode ? { test_event_code: ttTestCode } : {})
        }
      );
    void fireMetaWhenReady(
      "ViewContent",
      { content_ids: [product.id], content_name: product.name, value: Number(product.price) || 0, currency: "BDT" },
      eventId
    );
  }

  sendServerEvent("ViewContent", eventId, { contents, value: Number(product.price) || 0, currency: "BDT", userData });
}

export function trackAddToCart(
  product: { id: string; name: string; price: number },
  quantity: number,
  userData?: UserData
) {
  ensureClientPixelQueues();
  const eventId = uuidv4();
  const ttTestCode = typeof window !== "undefined" ? (window as any).__tt_test_code : "";
  const value = product.price * quantity;
  const contents: TrackContent[] = [
    {
      content_id: product.id,
      content_name: product.name,
      content_type: "product",
      price: product.price,
      quantity,
    },
  ];

  if (typeof window !== "undefined") {
    if (window.ttq)
      window.ttq.track(
        "AddToCart", 
        buildTikTokProductPayload(contents, value, "BDT"),
        { 
          event_id: eventId,
          ...(ttTestCode ? { test_event_code: ttTestCode } : {})
        }
      );
    void fireMetaWhenReady("AddToCart", { content_ids: [product.id], value, currency: "BDT" }, eventId);
  }

  sendServerEvent("AddToCart", eventId, { contents, value, currency: "BDT", userData });
}

export function trackInitiateCheckout(
  items: { id: string; name: string; price: number; quantity: number }[],
  total: number,
  userData?: UserData
) {
  ensureClientPixelQueues();
  const eventId = uuidv4();
  const ttTestCode = typeof window !== "undefined" ? (window as any).__tt_test_code : "";
  const contents: TrackContent[] = items.map((item) => ({
    content_id: item.id,
    content_name: item.name,
    content_type: "product",
    price: Number(item.price) || 0,
    quantity: item.quantity,
  }));

  if (typeof window !== "undefined") {
    if (window.ttq)
      window.ttq.track(
        "InitiateCheckout", 
        buildTikTokProductPayload(contents, total, "BDT"),
        { 
          event_id: eventId,
          ...(ttTestCode ? { test_event_code: ttTestCode } : {})
        }
      );
    void fireMetaWhenReady(
      "InitiateCheckout",
      { content_ids: items.map((i) => i.id), value: total, currency: "BDT", num_items: items.length },
      eventId
    );
  }

  sendServerEvent("InitiateCheckout", eventId, { contents, value: total, currency: "BDT", userData });
}

export function trackSearch(query: string, userData?: UserData) {
  ensureClientPixelQueues();
  const eventId = uuidv4();
  const ttTestCode = typeof window !== "undefined" ? (window as any).__tt_test_code : "";

  if (typeof window !== "undefined") {
    if (window.ttq) window.ttq.track("Search", { search_string: query }, { 
      event_id: eventId,
      ...(ttTestCode ? { test_event_code: ttTestCode } : {})
    });
    void fireMetaWhenReady("Search", { search_string: query }, eventId);
  }

  sendServerEvent("Search", eventId, { userData });
}

export function trackPurchase(
  items: { id: string; name: string; price: number; quantity: number }[],
  total: number,
  userData?: UserData,
  existingEventId?: string
) {
  ensureClientPixelQueues();
  const eventId = existingEventId || uuidv4();
  const ttTestCode = typeof window !== "undefined" ? (window as any).__tt_test_code : "";

  const contents: TrackContent[] = items.map((item) => ({
    content_id: item.id,
    content_name: item.name,
    content_type: "product",
    price: Number(item.price) || 0,
    quantity: item.quantity,
  }));

  // Client-side fire (if browsing)
  if (typeof window !== "undefined") {
    if (window.ttq)
      window.ttq.track(
        "Purchase",
        buildTikTokProductPayload(contents, total, "BDT"),
        { 
          event_id: eventId,
          ...(ttTestCode ? { test_event_code: ttTestCode } : {})
        }
      );
    void fireMetaWhenReady(
      "Purchase",
      { content_ids: items.map((i) => i.id), value: total, currency: "BDT" },
      eventId
    );
  }

  // Note: We don't call sendServerEvent here because Purchase is traditionally 
  // handled by the backend order confirmation flow in this app.
  console.log(`[Tracking] Client-side Purchase fired: ${eventId}`);
}
