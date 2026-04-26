/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/tracking.ts — Dual pixel tracking: client-side + server-side bridge

import { v4 as uuidv4 } from "uuid";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

declare global {
  interface Window {
    ttq: any;
    fbq: any;
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

export function trackPageView(userData?: UserData) {
  if (typeof window !== "undefined") {
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

  // Client-side
  if (typeof window !== "undefined") {
    if (window.ttq) window.ttq.track("PageView", {}, { event_id: eventId });
    if (window.fbq) window.fbq("track", "PageView", {}, { eventID: eventId });
  }

  // Server-side
  sendServerEvent("PageView", eventId, { userData });
}

export function trackViewContent(
  product: { id: string; name: string; price: number; category?: string },
  userData?: UserData
) {
  const eventId = uuidv4();
  const contents: TrackContent[] = [
    {
      content_id: product.id,
      content_name: product.name,
      content_type: product.category || "product",
      price: product.price,
      quantity: 1,
    },
  ];

  // Client-side
  if (typeof window !== "undefined") {
    if (window.ttq)
      window.ttq.track(
        "ViewContent",
        { contents, value: Number(product.price) || 0, currency: "BDT" },
        { event_id: eventId }
      );
    if (window.fbq)
      window.fbq(
        "track",
        "ViewContent",
        { content_ids: [product.id], content_name: product.name, value: Number(product.price) || 0, currency: "BDT" },
        { eventID: eventId }
      );
  }

  sendServerEvent("ViewContent", eventId, { contents, value: Number(product.price) || 0, currency: "BDT", userData });
}

export function trackAddToCart(
  product: { id: string; name: string; price: number },
  quantity: number,
  userData?: UserData
) {
  const eventId = uuidv4();
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
      window.ttq.track("AddToCart", { contents, value, currency: "BDT" }, { event_id: eventId });
    if (window.fbq)
      window.fbq("track", "AddToCart", { content_ids: [product.id], value, currency: "BDT" }, { eventID: eventId });
  }

  sendServerEvent("AddToCart", eventId, { contents, value, currency: "BDT", userData });
}

export function trackInitiateCheckout(
  items: { id: string; name: string; price: number; quantity: number }[],
  total: number,
  userData?: UserData
) {
  const eventId = uuidv4();
  const contents: TrackContent[] = items.map((item) => ({
    content_id: item.id,
    content_name: item.name,
    content_type: "product",
    price: Number(item.price) || 0,
    quantity: item.quantity,
  }));

  if (typeof window !== "undefined") {
    if (window.ttq)
      window.ttq.track("InitiateCheckout", { contents, value: total, currency: "BDT" }, { event_id: eventId });
    if (window.fbq)
      window.fbq(
        "track",
        "InitiateCheckout",
        { content_ids: items.map((i) => i.id), value: total, currency: "BDT", num_items: items.length },
        { eventID: eventId }
      );
  }

  sendServerEvent("InitiateCheckout", eventId, { contents, value: total, currency: "BDT", userData });
}

export function trackSearch(query: string, userData?: UserData) {
  const eventId = uuidv4();

  if (typeof window !== "undefined") {
    if (window.ttq) window.ttq.track("Search", { query }, { event_id: eventId });
    if (window.fbq) window.fbq("track", "Search", { search_string: query }, { eventID: eventId });
  }

  sendServerEvent("Search", eventId, { userData });
}
