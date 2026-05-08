"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api, { APIResponse } from "@/lib/api";

interface OrderItem {
  id: string; product_name: string; variant_name: string;
  unit_price: number; quantity: number; subtotal: number; image_url: string;
}
interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  customer_email: string; delivery_address: string; delivery_area: string;
  delivery_charge: number; subtotal: number; discount_amount: number; total: number;
  status: string; pixel_status: string | null; pixel_fired_at: string | null;
  admin_note: string; confirmed_at: string | null; cancelled_at: string | null;
  cancel_reason: string; items: OrderItem[]; created_at: string;
}

const statusBadge: Record<string, string> = {
  pending: "badge-pending", confirmed: "badge-confirmed", processing: "badge-processing",
  shipped: "badge-shipped", delivered: "badge-delivered", cancelled: "badge-cancelled",
};

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    api.get<APIResponse<Order>>(`/api/admin/orders/${id}`).then(res => {
      if (res.success && res.data) { setOrder(res.data); setNote(res.data.admin_note || ""); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const confirmOrder = async () => {
    setActionLoading("confirm");
    try {
      await api.patch(`/api/admin/orders/${id}/confirm`);
      showToast("✅ Order confirmed");
      const res = await api.get<APIResponse<Order>>(`/api/admin/orders/${id}`);
      if (res.success && res.data) setOrder(res.data);
    } catch (err) {
      showToast("❌ " + (err instanceof Error ? err.message : "Failed to confirm"));
    }
    setActionLoading("");
    setShowConfirmModal(false);
  };

  const cancelOrder = async () => {
    setActionLoading("cancel");
    try {
      await api.patch(`/api/admin/orders/${id}/cancel`, { reason: cancelReason });
      showToast("🚫 Order cancelled");
      const res = await api.get<APIResponse<Order>>(`/api/admin/orders/${id}`);
      if (res.success && res.data) setOrder(res.data);
    } catch (err) {
      showToast("❌ " + (err instanceof Error ? err.message : "Failed to cancel"));
    }
    setActionLoading("");
    setShowCancelModal(false);
  };

  const deleteOrder = async () => {
    setActionLoading("delete");
    try {
      await api.delete(`/api/admin/orders/${id}`);
      showToast("🗑️ Order deleted permanently");
      setTimeout(() => router.push("/admin/orders"), 500);
    } catch (err) {
      showToast("❌ " + (err instanceof Error ? err.message : "Failed to delete"));
    }
    setActionLoading("");
    setShowDeleteModal(false);
  };

  const updateStatus = async (status: string) => {
    setActionLoading(status);
    try {
      await api.patch(`/api/admin/orders/${id}/status`, { status });
      showToast(`Status updated to ${status}`);
      const res = await api.get<APIResponse<Order>>(`/api/admin/orders/${id}`);
      if (res.success && res.data) setOrder(res.data);
    } catch (err) {
      showToast("❌ " + (err instanceof Error ? err.message : "Failed"));
    }
    setActionLoading("");
  };

  const saveNote = async () => {
    try {
      await api.post(`/api/admin/orders/${id}/note`, { note });
      showToast("Note saved");
    } catch { showToast("Failed to save note"); }
  };

  if (loading) return <div className="h-96 skeleton rounded-xl" />;
  if (!order) return <p className="text-center py-12 text-charcoal-lighter">Order not found</p>;

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-charcoal text-white px-6 py-3 rounded-xl shadow-lg animate-fade-in text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button onClick={() => router.back()} className="text-sm text-charcoal-lighter hover:text-charcoal mb-2 flex items-center gap-1">
            ← Back to Orders
          </button>
          <h1 className="text-2xl font-bold text-charcoal">Order {order.order_number}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge text-sm ${statusBadge[order.status]}`}>{order.status.toUpperCase()}</span>
          {/* Pixel Status */}
          {order.pixel_status === "purchase" && (
            <span className="badge bg-emerald-100 text-emerald-700">🟢 Pixel: Purchase sent</span>
          )}
          {order.pixel_status === "cancelled" && (
            <span className="badge bg-red-100 text-red-700">🔴 Pixel: Cancelled</span>
          )}
          {!order.pixel_status && (
            <span className="badge bg-gray-100 text-gray-500">⚪ Pixel: Not fired</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-semibold text-charcoal mb-4">Order Items</h2>
            <div className="space-y-3">
              {order.items?.map(item => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-medium text-charcoal">{item.product_name}</p>
                    {item.variant_name && <p className="text-xs text-charcoal-lighter">{item.variant_name}</p>}
                    <p className="text-sm text-charcoal-lighter">৳{item.unit_price.toLocaleString()} × {item.quantity}</p>
                  </div>
                  <p className="font-semibold">৳{item.subtotal.toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-charcoal-lighter">Subtotal</span><span>৳{order.subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-charcoal-lighter">Delivery</span><span>{order.delivery_charge > 0 ? `৳${order.delivery_charge.toLocaleString()}` : "Free"}</span></div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100">
                <span>Total</span><span className="text-rose-gold">৳{order.total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Admin Note */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-semibold text-charcoal mb-4">Admin Note</h2>
            <textarea value={note} onChange={e => setNote(e.target.value)} className="input min-h-[80px]" placeholder="Internal note about this order..." rows={3} />
            <button onClick={saveNote} className="btn-ghost btn-sm mt-2">Save Note</button>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-semibold text-charcoal mb-4">Customer</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-charcoal-lighter">Name:</span> <span className="font-medium">{order.customer_name}</span></p>
              <p><span className="text-charcoal-lighter">Phone:</span> <a href={`tel:${order.customer_phone}`} className="font-medium text-rose-gold">{order.customer_phone}</a></p>
              {order.customer_email && <p><span className="text-charcoal-lighter">Email:</span> {order.customer_email}</p>}
              <p><span className="text-charcoal-lighter">Address:</span> {order.delivery_address}</p>
              {order.delivery_area && <p><span className="text-charcoal-lighter">Area:</span> {order.delivery_area}</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-semibold text-charcoal mb-4">Actions</h2>
            <div className="space-y-3">
              {order.status === "pending" && (
                <>
                  <button onClick={() => setShowConfirmModal(true)} className="btn-success w-full">✓ Confirm Order</button>
                  <button onClick={() => setShowCancelModal(true)} className="btn-danger w-full">✕ Cancel Order</button>
                </>
              )}
              {order.status === "confirmed" && (
                <>
                  <button onClick={() => updateStatus("processing")} disabled={!!actionLoading} className="btn-primary w-full">Mark as Processing</button>
                  <button onClick={() => setShowCancelModal(true)} className="btn-danger w-full">✕ Cancel Order</button>
                </>
              )}
              {order.status === "processing" && (
                <button onClick={() => updateStatus("shipped")} disabled={!!actionLoading} className="btn-primary w-full">Mark as Shipped</button>
              )}
              {order.status === "shipped" && (
                <button onClick={() => updateStatus("delivered")} disabled={!!actionLoading} className="btn-success w-full">Mark as Delivered</button>
              )}
              {order.cancel_reason && (
                <div className="bg-red-50 rounded-lg p-3 text-sm">
                  <p className="text-red-700 font-medium">Cancel Reason:</p>
                  <p className="text-red-600">{order.cancel_reason}</p>
                </div>
              )}

              {/* Delete Order — always visible */}
              <div className="pt-3 mt-3 border-t border-gray-100">
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  🗑️ Delete Order
                </button>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-semibold text-charcoal mb-4">Timeline</h2>
            <div className="space-y-2 text-sm">
              <p className="text-charcoal-lighter">Created: {new Date(order.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</p>
              {order.confirmed_at && <p className="text-blue-600">Confirmed: {new Date(order.confirmed_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</p>}
              {order.cancelled_at && <p className="text-red-600">Cancelled: {new Date(order.cancelled_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</p>}
              {order.pixel_fired_at && <p className="text-emerald-600">Pixel fired: {new Date(order.pixel_fired_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-lg font-bold text-charcoal mb-3">Confirm Order?</h3>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={confirmOrder} disabled={!!actionLoading} className="btn-success flex-1">
                {actionLoading === "confirm" ? "Confirming..." : "Yes, Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-lg font-bold text-charcoal mb-3">Cancel Order?</h3>
            <div className="mb-4">
              <label className="input-label">Reason (optional)</label>
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="input min-h-[60px]" placeholder="Why is this being cancelled?" rows={2} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)} className="btn-ghost flex-1">Go Back</button>
              <button onClick={cancelOrder} disabled={!!actionLoading} className="btn-danger flex-1">
                {actionLoading === "cancel" ? "Cancelling..." : "Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-lg font-bold text-charcoal mb-3">Delete Order Permanently?</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-medium">⚠️ This action cannot be undone</p>
              <p className="text-xs text-red-600 mt-1">Order <strong>{order.order_number}</strong> and all its data will be permanently deleted from the database.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="btn-ghost flex-1">Go Back</button>
              <button onClick={deleteOrder} disabled={!!actionLoading} className="btn-danger flex-1">
                {actionLoading === "delete" ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
