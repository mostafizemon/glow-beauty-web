"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import api, { APIResponse } from "@/lib/api";

interface Customer {
  id: string;
  phone: string;
  name: string;
  email: string;
  is_registered: boolean;
  created_at: string;
}

interface AuthContextType {
  customer: Customer | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (phone: string, name: string, password: string) => Promise<void>;
  guestCheckout: (phone: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<APIResponse<Customer>>("/api/auth/me");
      if (res.success && res.data) {
        setCustomer(res.data);
      }
    } catch {
      setCustomer(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (phone: string, password: string) => {
    const res = await api.post<APIResponse<Customer>>("/api/auth/login", { phone, password });
    if (res.success && res.data) {
      setCustomer(res.data);
      // Merge guest cart
      try { await api.post("/api/cart/merge"); } catch { /* ignore */ }
    }
  };

  const register = async (phone: string, name: string, password: string) => {
    const res = await api.post<APIResponse<Customer>>("/api/auth/register", { phone, name, password });
    if (res.success && res.data) {
      setCustomer(res.data);
      try { await api.post("/api/cart/merge"); } catch { /* ignore */ }
    }
  };

  const guestCheckout = async (phone: string, name: string) => {
    const res = await api.post<APIResponse<Customer>>("/api/auth/guest", { phone, name });
    if (res.success && res.data) {
      setCustomer(res.data);
    }
  };

  const logout = async () => {
    try { await api.post("/api/auth/logout"); } catch { /* ignore */ }
    setCustomer(null);
  };

  return (
    <AuthContext.Provider
      value={{
        customer,
        isLoggedIn: !!customer && customer.is_registered,
        isLoading,
        login, register, guestCheckout, logout, refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
