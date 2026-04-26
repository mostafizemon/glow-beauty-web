"use client";

import { useEffect, useState } from "react";
import api, { APIResponse } from "@/lib/api";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    api.get<APIResponse<Record<string, string>>>("/api/admin/settings").then(res => {
      if (res.success && res.data) setSettings(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const updateField = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/api/admin/settings", settings);
      setToast("✅ Settings saved successfully");
    } catch (err) {
      setToast("❌ " + (err instanceof Error ? err.message : "Failed to save"));
    }
    setSaving(false);
    setTimeout(() => setToast(""), 3000);
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-40 skeleton rounded-xl" />)}</div>;

  return (
    <div>
      {toast && <div className="fixed top-4 right-4 z-50 bg-charcoal text-white px-6 py-3 rounded-xl shadow-lg animate-fade-in text-sm">{toast}</div>}
      <h1 className="text-2xl font-bold text-charcoal mb-6">Settings</h1>

      {/* Honeypot to trap aggressive browser password managers */}
      <div style={{ display: 'none' }} aria-hidden="true">
        <input type="text" name="dummy-email" />
        <input type="password" name="dummy-password" />
      </div>

      <div className="space-y-6">
        {/* Site Info */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-rose-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>
            Site Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label">Site Name</label>
              <input value={settings.site_name || ""} onChange={e => updateField("site_name", e.target.value)} className="input" />
            </div>
            <div>
              <label className="input-label">Site Logo URL</label>
              <input value={settings.site_logo || ""} onChange={e => updateField("site_logo", e.target.value)} className="input" placeholder="Cloudinary URL" />
            </div>
            <div>
              <label className="input-label">WhatsApp Number</label>
              <input value={settings.whatsapp_number || ""} onChange={e => updateField("whatsapp_number", e.target.value)} className="input" placeholder="880..." />
            </div>
            <div>
              <label className="input-label">Contact Phone</label>
              <input value={settings.contact_phone || ""} onChange={e => updateField("contact_phone", e.target.value)} className="input" placeholder="+8801XXXXXXXXX" />
            </div>
            <div>
              <label className="input-label">Contact Email</label>
              <input value={settings.contact_email || ""} onChange={e => updateField("contact_email", e.target.value)} className="input" placeholder="support@example.com" />
            </div>
            <div>
              <label className="input-label">Primary Color</label>
              <div className="flex gap-2">
                <input value={settings.primary_color || "#E91E63"} onChange={e => updateField("primary_color", e.target.value)} className="input flex-1" />
                <input type="color" value={settings.primary_color || "#E91E63"} onChange={e => updateField("primary_color", e.target.value)} className="w-12 h-11 rounded-lg border border-gray-200 cursor-pointer" />
              </div>
            </div>
          </div>
        </div>

        {/* Delivery */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-rose-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
            Delivery Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="input-label">Delivery Enabled</label>
              <select value={settings.delivery_enabled || "true"} onChange={e => updateField("delivery_enabled", e.target.value)} className="input">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className="input-label">Delivery Charge (৳)</label>
              <input type="number" value={settings.delivery_charge || "0"} onChange={e => updateField("delivery_charge", e.target.value)} className="input" min="0" />
            </div>
            <div>
              <label className="input-label">Free Delivery Above (৳)</label>
              <input type="number" value={settings.delivery_free_above || "0"} onChange={e => updateField("delivery_free_above", e.target.value)} className="input" min="0" />
              <p className="text-xs text-charcoal-lighter mt-1">0 = always charge delivery</p>
            </div>
          </div>
        </div>

        {/* TikTok Pixel */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
            <span className="text-lg">🎵</span> TikTok Pixel
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label">Pixel ID</label>
              <input autoComplete="off" value={settings.tiktok_pixel_id || ""} onChange={e => updateField("tiktok_pixel_id", e.target.value)} className="input font-mono" placeholder="XXXXXXXXXXXXXXX" />
            </div>
            <div>
              <label className="input-label">Access Token</label>
              <input autoComplete="new-password" value={settings.tiktok_access_token || ""} onChange={e => updateField("tiktok_access_token", e.target.value)} className="input font-mono text-xs" placeholder="Server-side token" type="password" />
            </div>
            <div className="md:col-span-2">
              <label className="input-label">Test Event Code</label>
              <input value={settings.tiktok_test_code || ""} onChange={e => updateField("tiktok_test_code", e.target.value)} className="input font-mono" placeholder="TEST12345" />
              <p className="text-xs text-charcoal-lighter mt-1">Leave empty in production</p>
            </div>
          </div>
        </div>

        {/* Meta Pixel */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
            <span className="text-lg">📘</span> Meta (Facebook) Pixel
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label">Pixel ID</label>
              <input value={settings.meta_pixel_id || ""} onChange={e => updateField("meta_pixel_id", e.target.value)} className="input font-mono" placeholder="XXXXXXXXXXXXXXX" />
            </div>
            <div>
              <label className="input-label">Access Token</label>
              <input autoComplete="new-password" value={settings.meta_access_token || ""} onChange={e => updateField("meta_access_token", e.target.value)} className="input font-mono text-xs" placeholder="Conversions API token" type="password" />
            </div>
            <div className="md:col-span-2">
              <label className="input-label">Test Event Code</label>
              <input value={settings.meta_test_code || ""} onChange={e => updateField("meta_test_code", e.target.value)} className="input font-mono" placeholder="TEST12345" />
              <p className="text-xs text-charcoal-lighter mt-1">Leave empty in production</p>
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary px-12">
          {saving ? "Saving..." : "Save All Settings"}
        </button>
      </div>
    </div>
  );
}
