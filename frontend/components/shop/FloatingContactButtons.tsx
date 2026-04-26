"use client";

import { useEffect, useMemo, useState } from "react";
import api, { APIResponse } from "@/lib/api";

export default function FloatingContactButtons() {
  const [contact, setContact] = useState({
    phone: "",
    whatsapp: "",
  });

  useEffect(() => {
    api.get<APIResponse<Record<string, string>>>("/api/settings/public")
      .then((res) => {
        const data = res.data || {};
        setContact({
          phone: data.contact_phone || "",
          whatsapp: data.whatsapp_number || "",
        });
      })
      .catch(() => {});
  }, []);

  const phoneLink = useMemo(() => {
    const sanitized = contact.phone.replace(/\s+/g, "");
    return sanitized ? `tel:${sanitized}` : "";
  }, [contact.phone]);

  const whatsappLink = useMemo(() => {
    const digits = contact.whatsapp.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  }, [contact.whatsapp]);

  if (!phoneLink && !whatsappLink) return null;

  return (
    <div className="fixed right-4 bottom-6 md:right-6 md:bottom-8 z-50 flex flex-col gap-3">
      {whatsappLink && (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat on WhatsApp"
          className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg flex items-center justify-center transition-colors"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M19.11 17.21c-.27-.14-1.58-.78-1.82-.87-.24-.09-.42-.14-.6.14-.17.27-.68.87-.83 1.05-.15.18-.31.2-.58.07-.27-.14-1.13-.42-2.15-1.34-.79-.7-1.33-1.57-1.48-1.84-.15-.27-.02-.41.11-.55.12-.11.27-.29.41-.44.14-.15.18-.26.27-.43.09-.18.05-.34-.02-.48-.07-.14-.6-1.45-.82-1.99-.21-.52-.43-.45-.59-.46-.15-.01-.33-.01-.5-.01-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.27s.97 2.64 1.1 2.82c.13.18 1.9 2.89 4.61 4.06.64.27 1.14.44 1.53.56.64.2 1.23.17 1.7.1.52-.08 1.58-.65 1.81-1.28.22-.63.22-1.2.15-1.28-.07-.08-.25-.13-.52-.27z" />
            <path d="M16.01 3.2c-7.05 0-12.77 5.72-12.77 12.77 0 2.25.59 4.36 1.62 6.19L3 29l7.06-1.84a12.72 12.72 0 005.95 1.51h.01c7.05 0 12.77-5.72 12.77-12.77S23.07 3.2 16.02 3.2h-.01zm0 23.3h-.01a10.5 10.5 0 01-5.35-1.46l-.38-.22-4.19 1.09 1.12-4.08-.25-.42a10.5 10.5 0 01-1.62-5.44c0-5.82 4.73-10.56 10.56-10.56 2.82 0 5.47 1.1 7.46 3.09a10.48 10.48 0 013.09 7.46c0 5.83-4.74 10.56-10.57 10.56z" />
          </svg>
        </a>
      )}
      {phoneLink && (
        <a
          href={phoneLink}
          aria-label="Call now"
          className="w-12 h-12 rounded-full bg-rose-gold hover:opacity-90 text-white shadow-lg flex items-center justify-center transition-opacity"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 6.75A2.25 2.25 0 014.5 4.5h2.17a1.5 1.5 0 011.46 1.16l.54 2.43a1.5 1.5 0 01-.76 1.63l-1.35.77a11.25 11.25 0 005.63 5.63l.77-1.35a1.5 1.5 0 011.63-.76l2.43.54a1.5 1.5 0 011.16 1.46v2.17a2.25 2.25 0 01-2.25 2.25h-.75C8.54 20.25 3.75 15.46 3.75 9.75V9z" />
          </svg>
        </a>
      )}
    </div>
  );
}
