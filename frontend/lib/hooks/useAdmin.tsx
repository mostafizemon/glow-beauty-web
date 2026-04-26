"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import api, { APIResponse } from "@/lib/api";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "superadmin" | "admin";
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

interface AdminContextType {
  adminUser: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<APIResponse<AdminUser>>("/api/admin/auth/me");
      if (res.success && res.data) {
        setAdminUser(res.data);
      } else {
        setAdminUser(null);
      }
    } catch {
      setAdminUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.post<APIResponse<AdminUser>>("/api/admin/auth/login", { email, password });
    if (res.success && res.data) {
      setAdminUser(res.data);
    }
  };

  const logout = async () => {
    try { await api.post("/api/admin/auth/logout"); } catch { /* ignore */ }
    setAdminUser(null);
  };

  return (
    <AdminContext.Provider
      value={{
        adminUser,
        isAuthenticated: !!adminUser,
        isLoading,
        isSuperAdmin: adminUser?.role === "superadmin",
        login, logout, refresh,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
