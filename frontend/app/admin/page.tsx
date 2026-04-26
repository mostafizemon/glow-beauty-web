"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api, { APIResponse } from "@/lib/api";

interface Stats {
  total_orders: number; pending_orders: number; total_revenue: number;
  total_products: number; total_customers: number; today_orders: number; today_revenue: number;
}

interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  total: number; status: string; created_at: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    api.get<APIResponse<Stats>>("/api/admin/dashboard/stats").then(res => {
      if (res.success && res.data) setStats(res.data);
    }).catch(() => {});
    api.get<{ data: Order[] }>("/api/admin/orders", { limit: "10" }).then(res => {
      setRecentOrders(res.data || []);
    }).catch(() => {});
  }, []);

  const cards = stats ? [
    { label: "Today's Orders", value: stats.today_orders, color: "bg-blue-50 text-blue-700" },
    { label: "Today's Revenue", value: `৳${stats.today_revenue.toLocaleString()}`, color: "bg-emerald-50 text-emerald-700" },
    { label: "Pending Orders", value: stats.pending_orders, color: stats.pending_orders > 0 ? "bg-orange-50 text-orange-700" : "bg-gray-50 text-gray-700", alert: stats.pending_orders > 0 },
    { label: "Total Products", value: stats.total_products, color: "bg-purple-50 text-purple-700" },
  ] : [];

  const statusBadge: Record<string, string> = {
    pending: "badge-pending", confirmed: "badge-confirmed", processing: "badge-processing",
    shipped: "badge-shipped", delivered: "badge-delivered", cancelled: "badge-cancelled",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-charcoal mb-6">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => (
          <div key={i} className={`rounded-xl p-5 ${card.color} ${card.alert ? "ring-2 ring-orange-300 animate-pulse-soft" : ""}`}>
            <p className="text-sm opacity-70">{card.label}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-charcoal">Recent Orders</h2>
          <Link href="/admin/orders" className="text-sm text-rose-gold hover:underline">View All</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-charcoal-lighter">Order</th>
                <th className="text-left px-6 py-3 font-medium text-charcoal-lighter">Customer</th>
                <th className="text-left px-6 py-3 font-medium text-charcoal-lighter">Total</th>
                <th className="text-left px-6 py-3 font-medium text-charcoal-lighter">Status</th>
                <th className="text-left px-6 py-3 font-medium text-charcoal-lighter">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentOrders.map(order => (
                <tr key={order.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => window.location.href = `/admin/orders/${order.id}`}>
                  <td className="px-6 py-3 font-mono font-medium text-charcoal">{order.order_number}</td>
                  <td className="px-6 py-3">
                    <p className="text-charcoal">{order.customer_name}</p>
                    <p className="text-xs text-charcoal-lighter">{order.customer_phone}</p>
                  </td>
                  <td className="px-6 py-3 font-medium">৳{order.total.toLocaleString()}</td>
                  <td className="px-6 py-3"><span className={`badge ${statusBadge[order.status]}`}>{order.status}</span></td>
                  <td className="px-6 py-3 text-charcoal-lighter text-xs">
                    {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-charcoal-lighter">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
