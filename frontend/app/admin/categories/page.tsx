"use client";

import { useEffect, useState } from "react";
import api, { APIResponse } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    image_url: "",
    is_active: true,
    sort_order: 0,
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const fetchCategories = async () => {
    try {
      const res = await api.get<APIResponse<Category[]>>(
        "/api/admin/categories",
      );
      if (res.success) setCategories(res.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const slugify = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const resetForm = () => {
    setForm({
      name: "",
      slug: "",
      image_url: "",
      is_active: true,
      sort_order: 0,
    });
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug) {
      setToast("Name and slug required");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/api/admin/categories/${editId}`, form);
        setToast("Category updated");
      } else {
        await api.post("/api/admin/categories", form);
        setToast("Category created");
      }
      resetForm();
      fetchCategories();
    } catch (err) {
      setToast("❌ " + (err instanceof Error ? err.message : "Failed"));
    }
    setSaving(false);
    setTimeout(() => setToast(""), 3000);
  };

  const editCategory = (cat: Category) => {
    setForm({
      name: cat.name,
      slug: cat.slug,
      image_url: cat.image_url,
      is_active: cat.is_active,
      sort_order: cat.sort_order,
    });
    setEditId(cat.id);
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    try {
      await api.delete(`/api/admin/categories/${id}`);
      fetchCategories();
      setToast("Deleted");
    } catch {
      setToast("Failed");
    }
    setTimeout(() => setToast(""), 3000);
  };

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-charcoal text-white px-6 py-3 rounded-xl shadow-lg animate-fade-in text-sm">
          {toast}
        </div>
      )}
      <h1 className="text-2xl font-bold text-charcoal mb-6">Categories</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">
                    Slug
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-gray-400"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-gray-400"
                    >
                      No categories
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium">{cat.name}</td>
                      <td className="px-4 py-3 text-charcoal-lighter font-mono text-xs">
                        {cat.slug}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${cat.is_active ? "badge-delivered" : "badge-cancelled"}`}
                        >
                          {cat.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => editCategory(cat)}
                          className="text-rose-gold hover:underline text-sm mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCategory(cat.id)}
                          className="text-red-500 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-semibold text-charcoal mb-4">
              {editId ? "Edit Category" : "Add Category"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="input-label">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      name: e.target.value,
                      slug: editId ? p.slug : slugify(e.target.value),
                    }))
                  }
                  className="input"
                  placeholder="Category name"
                />
              </div>
              <div>
                <label className="input-label">Slug *</label>
                <input
                  value={form.slug}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, slug: e.target.value }))
                  }
                  className="input"
                />
              </div>
              <div>
                <label className="input-label">Image URL</label>
                <input
                  value={form.image_url}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, image_url: e.target.value }))
                  }
                  className="input"
                  placeholder="Cloudinary URL"
                />
              </div>
              <div>
                <label className="input-label">Sort Order</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      sort_order: Number(e.target.value),
                    }))
                  }
                  className="input"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, is_active: e.target.checked }))
                  }
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Active</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1"
                >
                  {saving ? "Saving..." : editId ? "Update" : "Create"}
                </button>
                {editId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="btn-ghost"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
