"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import api, { APIResponse, PaginatedResponse } from "@/lib/api";
import ProductGrid from "@/components/shop/ProductGrid";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_price?: number | null;
  images?: { url: string }[];
}

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string;
}

export default function HomePage() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [prodRes, catRes] = await Promise.all([
          api.get<PaginatedResponse<Product>>("/api/products", { featured: "true", limit: "8" }),
          api.get<APIResponse<Category[]>>("/api/categories"),
        ]);
        setFeatured((prodRes as PaginatedResponse<Product>).data || []);
        if (catRes.success) setCategories(catRes.data || []);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-cream via-blush-light/30 to-cream overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-32">
          <div className="text-center max-w-2xl mx-auto relative z-10">
            <span className="inline-block text-rose-gold text-sm font-medium tracking-widest uppercase mb-4 animate-fade-in">
              Premium Beauty Collection
            </span>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal leading-tight mb-6 animate-fade-in-up">
              Discover Your{" "}
              <span className="text-rose-gold italic">Glow</span>
            </h1>
            <p className="text-charcoal-lighter text-base md:text-lg leading-relaxed mb-8 animate-fade-in-up">
              Curated collection of authentic beauty products for skincare,
              makeup, and haircare. Because you deserve to feel beautiful.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up">
              <Link href="/products" className="btn-primary px-8 py-4 text-base">
                Shop Now
              </Link>
              <Link href="/products?featured=true" className="btn-outline px-8 py-4 text-base">
                Featured Products
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-10 right-10 w-72 h-72 bg-blush/20 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-rose-gold/10 rounded-full blur-3xl" />
      </section>

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="text-center mb-10">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-charcoal mb-3">
            Featured Products
          </h2>
          <p className="text-charcoal-lighter max-w-md mx-auto">
            Handpicked bestsellers loved by our customers
          </p>
        </div>
        <ProductGrid products={featured} loading={loading} />
        <div className="text-center mt-10">
          <Link href="/products" className="btn-outline">
            View All Products
          </Link>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="bg-cream-dark/50 py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="font-heading text-3xl md:text-4xl font-bold text-charcoal mb-3">
                Shop by Category
              </h2>
              <p className="text-charcoal-lighter">Find exactly what you&apos;re looking for</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/products?category=${cat.slug}`}
                  className="group relative aspect-square rounded-2xl overflow-hidden bg-cream-dark"
                >
                  {cat.image_url ? (
                    <Image
                      src={cat.image_url}
                      alt={cat.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blush-light/50 to-rose-gold/20" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <h3 className="text-white font-heading text-lg font-semibold">{cat.name}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Why Choose Us */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-charcoal mb-3">
            Why Choose Us
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              ),
              title: "100% Authentic",
              desc: "Only genuine, verified beauty products from trusted brands",
            },
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
              ),
              title: "Fast Delivery",
              desc: "Quick delivery across Bangladesh right to your doorstep",
            },
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              ),
              title: "Easy Returns",
              desc: "Simple return support for damaged or incorrect products within our return window",
            },
          ].map((feature, i) => (
            <div key={i} className="text-center p-6 rounded-2xl hover:bg-cream-dark/50 transition-colors">
              <div className="w-16 h-16 mx-auto mb-4 bg-blush/30 rounded-2xl flex items-center justify-center text-rose-gold">
                {feature.icon}
              </div>
              <h3 className="font-heading text-lg font-semibold text-charcoal mb-2">{feature.title}</h3>
              <p className="text-sm text-charcoal-lighter leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
