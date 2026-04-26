"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import api, { APIResponse } from "@/lib/api";

interface CartProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: { url: string }[];
}

interface CartVariant {
  id: string;
  name: string;
  value: string;
  price_delta: number;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  product: CartProduct | null;
  variant: CartVariant | null;
}

interface CartResponse {
  items: CartItem[];
  item_count: number;
  subtotal: number;
}

interface CartContextType {
  items: CartItem[];
  cartCount: number;
  subtotal: number;
  isLoading: boolean;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (productId: string, variantId?: string, quantity?: number, preventDrawerOpen?: boolean) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<APIResponse<CartResponse>>("/api/cart");
      if (res.success && res.data) {
        setItems(res.data.items || []);
        setSubtotal(res.data.subtotal || 0);
      }
    } catch {
      setItems([]);
      setSubtotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addItem = async (productId: string, variantId?: string, quantity: number = 1, preventDrawerOpen: boolean = false) => {
    await api.post("/api/cart/items", {
      product_id: productId,
      variant_id: variantId || null,
      quantity,
    });
    await refresh();
    if (!preventDrawerOpen) {
      setIsDrawerOpen(true);
    }
  };

  const updateItem = async (itemId: string, quantity: number) => {
    await api.patch(`/api/cart/items/${itemId}`, { quantity });
    await refresh();
  };

  const removeItem = async (itemId: string) => {
    await api.delete(`/api/cart/items/${itemId}`);
    await refresh();
  };

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items, cartCount, subtotal, isLoading,
        isDrawerOpen, openDrawer: () => setIsDrawerOpen(true), closeDrawer: () => setIsDrawerOpen(false),
        addItem, updateItem, removeItem, refresh,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
