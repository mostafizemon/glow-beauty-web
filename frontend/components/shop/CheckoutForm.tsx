"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api, { APIResponse } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";

interface PlaceOrderResponse {
  id: string;
  order_number: string;
}

export default function CheckoutForm({
  subtotal,
  deliveryCharge,
  total,
  checkoutMode,
  buyNowProduct,
  buyNowVariant,
  buyNowQty,
}: {
  subtotal: number;
  deliveryCharge: number;
  total: number;
  checkoutMode?: string;
  buyNowProduct?: string;
  buyNowVariant?: string;
  buyNowQty?: number;
}) {
  const router = useRouter();
  const { customer, guestCheckout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customer_name: customer?.name || "",
    customer_phone: customer?.phone || "",
    delivery_address: "",
    delivery_area: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.customer_name.trim()) { setError("Name is required"); return; }
    if (!form.customer_phone.trim()) { setError("Phone number is required"); return; }
    
    // Bangladeshi phone number pattern (+8801..., 8801..., 01...)
    if (!/^(?:\+88|88)?01[3-9]\d{8}$/.test(form.customer_phone.trim())) { 
      setError("Please enter a valid Bangladeshi phone number"); 
      return; 
    }
    
    if (!form.delivery_address.trim()) { setError("Delivery address is required"); return; }

    setLoading(true);
    try {
      // If not logged in, create guest account first
      if (!customer) {
        await guestCheckout(form.customer_phone.trim(), form.customer_name.trim());
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        delivery_address: form.delivery_address.trim(),
        delivery_area: form.delivery_area.trim(),
      };

      if (checkoutMode === "buy_now") {
        payload.checkout_mode = "buy_now";
        payload.buy_now_product_id = buyNowProduct;
        payload.buy_now_variant_id = buyNowVariant || null;
        payload.buy_now_quantity = buyNowQty;
      }

      const res = await api.post<APIResponse<PlaceOrderResponse>>("/api/orders", payload);

      if (res.success && res.data) {
        router.push(`/orders/${res.data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      <div>
        <label className="input-label">Full Name *</label>
        <input name="customer_name" value={form.customer_name} onChange={handleChange} className="input" placeholder="Your full name" />
      </div>

      <div>
        <label className="input-label">Phone Number *</label>
        <input name="customer_phone" value={form.customer_phone} onChange={handleChange} className="input" placeholder="01XXXXXXXXX" type="tel" />
        <p className="text-xs text-charcoal-lighter mt-1">We&apos;ll call to confirm your order</p>
      </div>

      <div>
        <label className="input-label">Delivery Address *</label>
        <textarea
          name="delivery_address"
          value={form.delivery_address}
          onChange={handleChange}
          className="input min-h-[80px]"
          placeholder="House, road, area — full address"
          rows={3}
        />
      </div>

      <div>
        <label className="input-label">District / Area (Optional)</label>
        <input name="delivery_area" value={form.delivery_area} onChange={handleChange} className="input" placeholder="e.g. Dhaka, Chittagong" />
      </div>

      {/* Summary */}
      <div className="bg-cream/60 rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-charcoal-lighter">Subtotal</span><span>৳{subtotal.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-charcoal-lighter">Delivery</span><span>{deliveryCharge > 0 ? `৳${deliveryCharge.toLocaleString()}` : "Free"}</span></div>
        <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200">
          <span>Total</span><span className="text-rose-gold">৳{total.toLocaleString()}</span>
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full py-4 text-base">
        {loading ? "Placing Order..." : `Place Order — ৳${total.toLocaleString()}`}
      </button>

      <p className="text-xs text-charcoal-lighter text-center">
        Cash on Delivery • We&apos;ll call to confirm your order
      </p>
    </form>
  );
}
