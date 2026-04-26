"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";

interface Product {
  id: string; name: string; slug: string; price: number; stock: number;
  is_active: boolean; is_featured: boolean; images?: { url: string }[];
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get<{ data: Product[]; total: number }>("/api/admin/products", { page: String(page), limit: "20" })
      .then(res => { setProducts(res.data || []); setTotal(res.total); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [page]);

  const deleteProduct = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await api.delete(`/api/admin/products/${id}`);
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch { alert("Failed to delete"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-charcoal">Products</h1>
        <Link href="/admin/products/new" className="btn-primary">+ Add Product</Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Product</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Price</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Stock</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Status</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal-lighter">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={5} className="px-4 py-4"><div className="h-10 skeleton" /></td></tr>)
              ) : products.map(product => (
                <tr key={product.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-cream-dark flex-shrink-0 relative">
                        {product.images?.[0]?.url ? (
                          <Image src={product.images[0].url} alt={product.name} fill className="object-cover" sizes="40px" />
                        ) : <div className="w-full h-full bg-cream-dark" />}
                      </div>
                      <span className="font-medium text-charcoal line-clamp-1">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">৳{product.price.toLocaleString()}</td>
                  <td className="px-4 py-3">{product.stock}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${product.is_active ? "badge-delivered" : "badge-cancelled"}`}>
                      {product.is_active ? "Active" : "Inactive"}
                    </span>
                    {product.is_featured && <span className="badge badge-confirmed ml-1">Featured</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/admin/products/${product.id}`} className="text-rose-gold hover:underline text-sm">Edit</Link>
                      <button onClick={() => deleteProduct(product.id)} className="text-red-500 hover:underline text-sm">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-charcoal-lighter">{total} products</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-ghost btn-sm">Previous</button>
              <button disabled={products.length < 20} onClick={() => setPage(p => p + 1)} className="btn-ghost btn-sm">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
