"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api, { APIResponse } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";

interface Order {
  id: string; order_number: string; customer_name: string; total: number;
  status: string; created_at: string;
}

const statusBadge: Record<string, string> = {
  pending: "badge-pending", confirmed: "badge-confirmed", processing: "badge-processing",
  shipped: "badge-shipped", delivered: "badge-delivered", cancelled: "badge-cancelled",
};

export default function OrderHistoryPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.push("/auth/login?redirect=/orders/history");
      return;
    }
    if (isLoggedIn) {
      api.get<APIResponse<Order[]>>("/api/orders/my").then(res => {
        if (res.success) setOrders(res.data || []);
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [isLoggedIn, authLoading, router]);

  if (authLoading || loading) {
    return <div className="max-w-3xl mx-auto px-4 py-12"><div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 skeleton rounded-xl" />)}</div></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12">
      <h1 className="font-heading text-3xl font-bold text-charcoal mb-8">Order History</h1>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-charcoal-lighter mb-4">No orders yet</p>
          <a href="/products" className="btn-primary">Start Shopping</a>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <a
              key={order.id}
              href={`/orders/${order.id}`}
              className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <p className="font-mono font-semibold text-charcoal">{order.order_number}</p>
                <p className="text-sm text-charcoal-lighter mt-1">
                  {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })}
                </p>
              </div>
              <div className="text-right">
                <span className={`badge ${statusBadge[order.status] || "badge-pending"}`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
                <p className="text-sm font-semibold text-charcoal mt-1">৳{order.total.toLocaleString()}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
