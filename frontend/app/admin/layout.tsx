"use client";

import { useState } from "react";
import Image from "next/image";
import { AdminProvider, useAdmin } from "@/lib/hooks/useAdmin";
import AdminSidebar from "@/components/admin/Sidebar";
import api, { APIResponse } from "@/lib/api";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { adminUser, isAuthenticated, isLoading } = useAdmin();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // If not authenticated, show login form
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-rose-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError("");
      setLoginLoading(true);
      try {
        await api.post<APIResponse>("/api/admin/auth/login", loginForm);
        window.location.reload();
      } catch (err) {
        setLoginError(err instanceof Error ? err.message : "Login failed");
      } finally {
        setLoginLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-48 h-12 mb-6">
              <Image src="/logo.png" alt="Glow Beauty Goals" fill className="object-contain scale-[1.5] origin-center" priority />
            </div>
            <h1 className="font-heading text-xl font-bold text-charcoal">Admin Login</h1>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {loginError && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{loginError}</div>}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="input-label">Email</label>
                <input type="email" value={loginForm.email} onChange={e => setLoginForm(p => ({...p, email: e.target.value}))} className="input" placeholder="admin@glow.com" />
              </div>
              <div>
                <label className="input-label">Password</label>
                <input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({...p, password: e.target.value}))} className="input" placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loginLoading} className="btn-primary w-full">{loginLoading ? "Signing in..." : "Sign In"}</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed left-0 top-0 h-screen z-40">
        <AdminSidebar />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed left-0 top-0 h-screen z-50 lg:hidden animate-slide-in-right">
            <AdminSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100 px-4 lg:px-8 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm text-charcoal-lighter hidden sm:block">{adminUser?.email}</span>
            <span className="badge badge-confirmed text-xs">{adminUser?.role}</span>
          </div>
        </div>

        <div className="p-4 lg:p-8">{children}</div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminProvider>
  );
}
