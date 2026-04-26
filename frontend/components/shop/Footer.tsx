/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import api, { APIResponse } from "@/lib/api";

export default function Footer() {
  const [contact, setContact] = useState({
    email: "support@glowbeauty.com",
    phone: "",
    whatsapp: "",
  });

  useEffect(() => {
    api.get<APIResponse<Record<string, string>>>("/api/settings/public")
      .then((res) => {
        const data = res.data || {};
        setContact({
          email: data.contact_email || "support@glowbeauty.com",
          phone: data.contact_phone || "",
          whatsapp: data.whatsapp_number || "",
        });
      })
      .catch(() => {});
  }, []);

  const whatsappLink = useMemo(() => {
    const digits = contact.whatsapp.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  }, [contact.whatsapp]);

  const phoneLink = useMemo(() => {
    const sanitized = contact.phone.replace(/\s+/g, "");
    return sanitized ? `tel:${sanitized}` : "";
  }, [contact.phone]);

  return (
    <footer className="bg-charcoal text-white mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <div className="relative h-12 w-48 mb-6">
              <Image src="/logo.png" alt="Glow Beauty Goals" fill className="object-contain object-left scale-[1.5] origin-left" />
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Your trusted destination for premium beauty products. Authentic
              skincare, makeup, and haircare delivered to your doorstep.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-heading text-lg mb-4 text-white">Quick Links</h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/products" className="text-gray-400 text-sm hover:text-rose-gold transition-colors">
                  All Products
                </Link>
              </li>
              <li>
                <Link href="/orders/history" className="text-gray-400 text-sm hover:text-rose-gold transition-colors">
                  Track Order
                </Link>
              </li>
              <li>
                <Link href="/auth/login" className="text-gray-400 text-sm hover:text-rose-gold transition-colors">
                  My Account
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-heading text-lg mb-4 text-white">Contact Us</h4>
            <div className="space-y-2.5 text-gray-400 text-sm">
              <p className="flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <a href={`mailto:${contact.email}`} className="hover:text-rose-gold transition-colors">{contact.email}</a>
              </p>
              {contact.phone && (
                <p className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-rose-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 6.75A2.25 2.25 0 014.5 4.5h2.17a1.5 1.5 0 011.46 1.16l.54 2.43a1.5 1.5 0 01-.76 1.63l-1.35.77a11.25 11.25 0 005.63 5.63l.77-1.35a1.5 1.5 0 011.63-.76l2.43.54a1.5 1.5 0 011.16 1.46v2.17a2.25 2.25 0 01-2.25 2.25h-.75C8.54 20.25 3.75 15.46 3.75 9.75V9z" />
                  </svg>
                  <a href={phoneLink} className="hover:text-rose-gold transition-colors">{contact.phone}</a>
                </p>
              )}
              {contact.whatsapp && (
                <p className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-rose-gold" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  </svg>
                  <a href={whatsappLink} target="_blank" rel="noreferrer" className="hover:text-rose-gold transition-colors">
                    WhatsApp Support
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-xs">
            © {new Date().getFullYear()} Glow & Beauty Goals. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-gray-500 text-xs">
            <span>Cash on Delivery Available</span>
            <span>•</span>
            <span>Nationwide Shipping</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
