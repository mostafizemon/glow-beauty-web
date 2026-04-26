"use client";

import { useEffect, useState } from "react";
import api, { APIResponse } from "@/lib/api";
import { useAdmin } from "@/lib/hooks/useAdmin";

interface AdminUser { id: string; name: string; email: string; phone: string; role: string; is_active: boolean; created_at: string; last_login: string | null; }

export default function AdminUsersPage() {
  const { isSuperAdmin } = useAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "admin" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const fetchUsers = async () => {
    try {
      const res = await api.get<APIResponse<AdminUser[]>>("/api/admin/users");
      if (res.success) setUsers(res.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  if (!isSuperAdmin) {
    return (
      <div className="text-center py-16">
        <p className="text-charcoal-lighter">Superadmin access required</p>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { setToast("Name, email, and password required"); setTimeout(() => setToast(""), 3000); return; }
    setSaving(true);
    try {
      await api.post("/api/admin/users", form);
      setToast("Admin user created");
      setShowForm(false);
      setForm({ name: "", email: "", phone: "", password: "", role: "admin" });
      fetchUsers();
    } catch (err) { setToast("❌ " + (err instanceof Error ? err.message : "Failed")); }
    setSaving(false);
    setTimeout(() => setToast(""), 3000);
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Delete this admin user?")) return;
    try { await api.delete(`/api/admin/users/${id}`); fetchUsers(); setToast("Deleted"); } catch { setToast("Failed"); }
    setTimeout(() => setToast(""), 3000);
  };

  return (
    <div>
      {toast && <div className="fixed top-4 right-4 z-50 bg-charcoal text-white px-6 py-3 rounded-xl shadow-lg animate-fade-in text-sm">{toast}</div>}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-charcoal">Admin Users</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">+ Add Admin</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6 animate-fade-in">
          <h2 className="font-semibold text-charcoal mb-4">New Admin User</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="input-label">Name *</label><input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} className="input" /></div>
            <div><label className="input-label">Email *</label><input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} className="input" /></div>
            <div><label className="input-label">Phone</label><input value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} className="input" /></div>
            <div><label className="input-label">Password *</label><input type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} className="input" /></div>
            <div>
              <label className="input-label">Role</label>
              <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))} className="input">
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
            <div className="flex items-end"><button type="submit" disabled={saving} className="btn-primary w-full">{saving ? "Creating..." : "Create"}</button></div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Name</th>
              <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Email</th>
              <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Role</th>
              <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Status</th>
              <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Last Login</th>
              <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center">Loading...</td></tr> :
              users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3 text-charcoal-lighter">{user.email}</td>
                  <td className="px-4 py-3"><span className={`badge ${user.role === "superadmin" ? "badge-shipped" : "badge-confirmed"}`}>{user.role}</span></td>
                  <td className="px-4 py-3"><span className={`badge ${user.is_active ? "badge-delivered" : "badge-cancelled"}`}>{user.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-3 text-xs text-charcoal-lighter">{user.last_login ? new Date(user.last_login).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" }) : "Never"}</td>
                  <td className="px-4 py-3"><button onClick={() => deleteUser(user.id)} className="text-red-500 hover:underline text-sm">Delete</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
