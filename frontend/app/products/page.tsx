"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import api, { APIResponse, PaginatedResponse } from "@/lib/api";
import ProductGrid from "@/components/shop/ProductGrid";
import { trackSearch } from "@/lib/tracking";

interface Product {
  id: string; name: string; slug: string; price: number;
  compare_price?: number | null; images?: { url: string }[];
}
interface Category { id: string; name: string; slug: string; }

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");

  const page = parseInt(searchParams.get("page") || "1");
  const category = searchParams.get("category") || "";
  const featured = searchParams.get("featured") || "";

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: "12" };
      if (category) params.category = category;
      if (search) params.search = search;
      if (featured) params.featured = featured;

      const res = await api.get<PaginatedResponse<Product>>("/api/products", params);
      setProducts(res.data || []);
      setTotal(res.total);
      setTotalPages(res.total_pages);
    } catch { setProducts([]); }
    setLoading(false);
  }, [page, category, search, featured]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    api.get<APIResponse<Category[]>>("/api/categories").then((res) => {
      if (res.success) setCategories(res.data || []);
    }).catch(() => {});
  }, []);

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v); else params.delete(k);
    });
    if ("page" in updates === false) params.set("page", "1");
    router.push(`/products?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search, page: "1" });
    if (search) trackSearch(search);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-charcoal mb-2">
          {category ? categories.find(c => c.slug === category)?.name || "Products" : featured ? "Featured Products" : "All Products"}
        </h1>
        <p className="text-charcoal-lighter">{total} products found</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Filters */}
        <aside className="lg:w-56 flex-shrink-0">
          {/* Search */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="relative">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="input pr-10" />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-lighter hover:text-rose-gold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          {/* Categories */}
          <div>
            <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider mb-3">Categories</h3>
            <div className="space-y-1">
              <button
                onClick={() => updateParams({ category: "", page: "1" })}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!category ? "bg-rose-gold/10 text-rose-gold font-medium" : "text-charcoal-light hover:bg-cream-dark"}`}
              >
                All Products
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => updateParams({ category: cat.slug, page: "1" })}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${category === cat.slug ? "bg-rose-gold/10 text-rose-gold font-medium" : "text-charcoal-light hover:bg-cream-dark"}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          <ProductGrid products={products} loading={loading} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) })}
                className="btn-ghost btn-sm disabled:opacity-30"
              >
                ← Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
                .map((p, i, arr) => (
                  <span key={p}>
                    {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-gray-300">…</span>}
                    <button
                      onClick={() => updateParams({ page: String(p) })}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${p === page ? "bg-rose-gold text-white" : "hover:bg-cream-dark text-charcoal-light"}`}
                    >
                      {p}
                    </button>
                  </span>
                ))}
              <button
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
                className="btn-ghost btn-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-12"><div className="h-96 skeleton rounded-xl" /></div>}>
      <ProductsPageInner />
    </Suspense>
  );
}
