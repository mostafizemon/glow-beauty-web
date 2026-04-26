"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/hooks/useCart";
import { trackAddToCart } from "@/lib/tracking";
import { useState } from "react";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_price?: number | null;
  images?: { url: string }[];
}

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);

  const imageUrl = product.images?.[0]?.url || "/placeholder-product.jpg";
  const hasDiscount = product.compare_price && product.compare_price > product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.compare_price! - product.price) / product.compare_price!) * 100)
    : 0;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAdding(true);
    try {
      await addItem(product.id);
      trackAddToCart({ id: product.id, name: product.name, price: product.price }, 1);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="card-hover">
        {/* Image */}
        <div className="relative aspect-[4/5] overflow-hidden bg-cream-dark">
          {imageUrl && imageUrl !== "/placeholder-product.jpg" ? (
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-charcoal-lighter">
              <svg className="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {/* Discount badge */}
          {hasDiscount && (
            <span className="absolute top-2 left-2 bg-rose-gold text-white text-[10px] font-bold px-2 py-1 rounded-full">
              -{discountPercent}%
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-3 md:p-4">
          <h3 className="text-sm font-medium text-charcoal line-clamp-2 leading-snug mb-1.5 group-hover:text-rose-gold transition-colors">
            {product.name}
          </h3>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-base font-bold text-rose-gold">
              ৳{product.price.toLocaleString()}
            </span>
            {hasDiscount && (
              <span className="text-xs text-charcoal-lighter line-through">
                ৳{product.compare_price!.toLocaleString()}
              </span>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            disabled={adding}
            className="w-full btn-primary btn-sm text-xs"
          >
            {adding ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              "Add to Cart"
            )}
          </button>
        </div>
      </div>
    </Link>
  );
}
