"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api, { APIResponse } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";

import { trackPurchase } from "@/lib/tracking";

interface OrderItem {
  id: string; product_id?: string; product_name: string; variant_name: string;
  unit_price: number; quantity: number; subtotal: number; image_url: string;
}
interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  subtotal: number; delivery_charge: number; total: number; status: string;
  items: OrderItem[]; created_at: string; event_id?: string;
}

export default function OrderSuccessPage() {
  const { id } = useParams();
  const { isLoggedIn } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [contactPhone, setContactPhone] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<APIResponse<Order>>(`/api/orders/${id}`),
      api.get<APIResponse<Record<string, string>>>("/api/settings/public"),
    ])
      .then(([orderRes, settingsRes]) => {
        if (orderRes.success && orderRes.data) {
          const orderData = orderRes.data;
          setOrder(orderData);

          // Track Purchase on arrival
          const dedupKey = `__gbg_purchase_tracked_${orderData.id}`;
          if (!sessionStorage.getItem(dedupKey)) {
            trackPurchase(
              orderData.items.map(i => ({
                id: i.product_id || "",
                name: i.product_name,
                price: i.unit_price,
                quantity: i.quantity
              })),
              orderData.total,
              { phone: orderData.customer_phone, name: orderData.customer_name },
              orderData.event_id
            );
            sessionStorage.setItem(dedupKey, "true");
          }
        }
        if (settingsRes.success && settingsRes.data?.contact_phone) {
          setContactPhone(settingsRes.data.contact_phone);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-12"><div className="h-96 skeleton rounded-xl" /></div>;
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="font-heading text-2xl text-charcoal">Order not found</h1>
        <Link href="/" className="btn-primary mt-4">Go Home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4 animate-fade-in-up">
          <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-heading text-3xl font-bold text-charcoal mb-2 animate-fade-in-up">
          Thank you, {order.customer_name}!
        </h1>
        <p className="text-charcoal-lighter animate-fade-in-up">Your order has been placed successfully</p>
      </div>

      <div className="card p-6 mb-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-charcoal-lighter">Order Number</span>
          <span className="font-mono font-bold text-rose-gold text-lg">{order.order_number}</span>
        </div>

        <div className="space-y-3 border-t border-gray-100 pt-4">
          {order.items?.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-charcoal">
                {item.product_name} {item.variant_name ? `(${item.variant_name})` : ""} × {item.quantity}
              </span>
              <span className="font-medium">৳{item.subtotal.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 mt-4 pt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-charcoal-lighter">Subtotal</span><span>৳{order.subtotal.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-charcoal-lighter">Delivery</span><span>{order.delivery_charge > 0 ? `৳${order.delivery_charge.toLocaleString()}` : "Free"}</span></div>
          <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100">
            <span>Total</span><span className="text-rose-gold">৳{order.total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="card p-6 text-center bg-blush-light/30 border-blush animate-fade-in-up">
        <p className="text-charcoal font-medium mb-1">📞 We will call you to confirm your order</p>
        <p className="text-sm text-charcoal-lighter">
          Please keep your phone ({contactPhone || order.customer_phone}) reachable
        </p>
      </div>

      {!isLoggedIn && (
        <div className="card p-6 mt-6 text-center animate-fade-in-up">
          <p className="text-charcoal font-medium mb-2">Want to track your orders?</p>
          <Link href="/auth/register" className="btn-outline btn-sm">
            Create an Account
          </Link>
        </div>
      )}

      <div className="text-center mt-8 animate-fade-in-up">
        <Link href="/products" className="btn-primary">Continue Shopping</Link>
      </div>
    </div>
  );
}
