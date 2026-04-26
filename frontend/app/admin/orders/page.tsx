"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  total: number; status: string; pixel_status: string | null; created_at: string;
}

const statusTabs = ["all", "pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const statusBadge: Record<string, string> = {
  pending: "badge-pending", confirmed: "badge-confirmed", processing: "badge-processing",
  shipped: "badge-shipped", delivered: "badge-delivered", cancelled: "badge-cancelled",
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: "20" };
      if (activeTab !== "all") params.status = activeTab;
      const res = await api.get<{ data: Order[]; total: number }>("/api/admin/orders", params);
      setOrders(res.data || []);
      setTotal(res.total);
    } catch { setOrders([]); }
    if (showLoader) setLoading(false);
    else setRefreshing(false);
  }, [page, activeTab]);

  useEffect(() => { fetchOrders(true); }, [fetchOrders]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-charcoal mb-6">Orders</h1>
      {refreshing && (
        <p className="text-xs text-charcoal-lighter mb-3">Refreshing orders...</p>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {statusTabs.map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? "bg-rose-gold text-white" : "bg-white text-charcoal-light hover:bg-cream-dark border border-gray-100"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Order</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Total</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Status</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Pixel</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-4"><div className="h-6 skeleton w-full" /></td></tr>
                ))
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-charcoal-lighter">No orders found</td></tr>
              ) : (
                orders.map(order => (
                  <tr
                    key={order.id}
                    className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${order.status === "pending" ? "bg-orange-50/30" : ""}`}
                    onClick={() => window.location.href = `/admin/orders/${order.id}`}
                  >
                    <td className="px-4 py-3 font-mono font-medium text-charcoal">{order.order_number}</td>
                    <td className="px-4 py-3">
                      <p className="text-charcoal font-medium">{order.customer_name}</p>
                      <p className="text-xs text-charcoal-lighter">{order.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold">৳{order.total.toLocaleString()}</td>
                    <td className="px-4 py-3"><span className={`badge ${statusBadge[order.status]}`}>{order.status}</span></td>
                    <td className="px-4 py-3">
                      {order.pixel_status === "purchase" && <span className="badge badge-delivered">Purchase ✓</span>}
                      {order.pixel_status === "cancelled" && <span className="badge badge-cancelled">Cancelled</span>}
                      {!order.pixel_status && <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-charcoal-lighter text-xs whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-charcoal-lighter">{total} orders total</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-ghost btn-sm">Previous</button>
              <button disabled={orders.length < 20} onClick={() => setPage(p => p + 1)} className="btn-ghost btn-sm">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
