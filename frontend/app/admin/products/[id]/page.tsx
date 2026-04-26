"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api, { APIResponse } from "@/lib/api";
import ImageUploader from "@/components/admin/ImageUploader";

interface Category { id: string; name: string; slug: string; }
interface ProductImage { id: string; cloudinary_id: string; url: string; is_primary: boolean; sort_order: number; }
interface Product {
  id: string; category_id: string | null; name: string; slug: string; description: string;
  price: number; compare_price: number | null; stock: number; sku: string;
  is_active: boolean; is_featured: boolean; sort_order: number;
  images: ProductImage[]; variants: { id: string; name: string; value: string; price_delta: number; stock: number }[];
}

export default function AdminProductFormPage() {
  const { id } = useParams();
  const router = useRouter();
  const isNew = id === "new";
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<{ cloudinary_id: string; url: string }[]>([]);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({
    name: "", slug: "", description: "", category_id: "" as string | null,
    price: 0, compare_price: null as number | null, stock: 0, sku: "",
    is_active: true, is_featured: false, sort_order: 0,
  });

  useEffect(() => {
    api.get<APIResponse<Category[]>>("/api/admin/categories").then(res => {
      if (res.success) setCategories(res.data || []);
    }).catch(() => {});

    if (!isNew) {
      api.get<APIResponse<Product>>(`/api/admin/products/${id}`).then(res => {
        if (res.success && res.data) {
          const p = res.data;
          setForm({
            name: p.name, slug: p.slug, description: p.description,
            category_id: p.category_id, price: p.price, compare_price: p.compare_price,
            stock: p.stock, sku: p.sku, is_active: p.is_active,
            is_featured: p.is_featured, sort_order: p.sort_order,
          });
          setImages(p.images.map(i => ({ cloudinary_id: i.cloudinary_id, url: i.url })));
        }
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleNameChange = (name: string) => {
    setForm(prev => ({ ...prev, name, slug: isNew ? slugify(name) : prev.slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug) { setToast("Name and slug are required"); return; }
    setSaving(true);

    try {
      const body = {
        ...form,
        category_id: form.category_id || null,
        compare_price: form.compare_price || null,
      };

      let productId = id;
      if (isNew) {
        const res = await api.post<APIResponse<{ id: string }>>("/api/admin/products", body);
        if (res.success && res.data) productId = res.data.id;
      } else {
        await api.put(`/api/admin/products/${id}`, body);
      }

      // Upload images for new products
      if (isNew && productId) {
        for (let i = 0; i < images.length; i++) {
          await api.post(`/api/admin/products/${productId}/images`, {
            cloudinary_id: images[i].cloudinary_id,
            url: images[i].url,
            is_primary: i === 0,
            sort_order: i,
          });
        }
      }

      setToast("Product saved!");
      setTimeout(() => router.push("/admin/products"), 1000);
    } catch (err) {
      setToast("❌ " + (err instanceof Error ? err.message : "Save failed"));
    }
    setSaving(false);
  };

  const handleImageUpload = async (img: { cloudinary_id: string; url: string }) => {
    if (!isNew && id) {
      // For existing products, save immediately
      await api.post(`/api/admin/products/${id}/images`, {
        cloudinary_id: img.cloudinary_id,
        url: img.url,
        is_primary: images.length === 0,
        sort_order: images.length,
      });
    }
    setImages(prev => [...prev, img]);
  };

  const handleImageRemove = async (cloudinaryId: string) => {
    setImages(prev => prev.filter(i => i.cloudinary_id !== cloudinaryId));
  };

  if (loading) return <div className="h-96 skeleton rounded-xl" />;

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-charcoal text-white px-6 py-3 rounded-xl shadow-lg animate-fade-in text-sm">{toast}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-charcoal">{isNew ? "Add Product" : "Edit Product"}</h1>
        <button onClick={() => router.back()} className="btn-ghost btn-sm">← Back</button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
              <div>
                <label className="input-label">Product Name *</label>
                <input value={form.name} onChange={e => handleNameChange(e.target.value)} className="input" placeholder="Enter product name" />
              </div>
              <div>
                <label className="input-label">Slug *</label>
                <input value={form.slug} onChange={e => setForm(p => ({...p, slug: e.target.value}))} className="input" placeholder="product-url-slug" />
              </div>
              <div>
                <label className="input-label">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} className="input min-h-[120px]" rows={5} placeholder="Product description..." />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <ImageUploader images={images} onUpload={handleImageUpload} onRemove={handleImageRemove} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-charcoal">Pricing & Stock</h3>
              <div>
                <label className="input-label">Price (৳) *</label>
                <input type="number" value={form.price} onChange={e => setForm(p => ({...p, price: Number(e.target.value)}))} className="input" min="0" />
              </div>
              <div>
                <label className="input-label">Compare Price (৳)</label>
                <input type="number" value={form.compare_price || ""} onChange={e => setForm(p => ({...p, compare_price: e.target.value ? Number(e.target.value) : null}))} className="input" min="0" placeholder="Original price for strikethrough" />
              </div>
              <div>
                <label className="input-label">Stock</label>
                <input type="number" value={form.stock} onChange={e => setForm(p => ({...p, stock: Number(e.target.value)}))} className="input" min="0" />
              </div>
              <div>
                <label className="input-label">SKU</label>
                <input value={form.sku} onChange={e => setForm(p => ({...p, sku: e.target.value}))} className="input" placeholder="SKU-001" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-charcoal">Organization</h3>
              <div>
                <label className="input-label">Category</label>
                <select value={form.category_id || ""} onChange={e => setForm(p => ({...p, category_id: e.target.value || null}))} className="input">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({...p, is_active: e.target.checked}))} className="w-4 h-4 rounded text-rose-gold focus:ring-rose-gold" />
                <span className="text-sm">Active (visible in store)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.is_featured} onChange={e => setForm(p => ({...p, is_featured: e.target.checked}))} className="w-4 h-4 rounded text-rose-gold focus:ring-rose-gold" />
                <span className="text-sm">Featured (show on homepage)</span>
              </label>
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? "Saving..." : isNew ? "Create Product" : "Update Product"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
