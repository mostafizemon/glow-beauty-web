"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import api, { APIResponse, PaginatedResponse } from "@/lib/api";
import ProductCard from "@/components/shop/ProductCard";
import { useCart } from "@/lib/hooks/useCart";
import { trackViewContent, trackAddToCart } from "@/lib/tracking";

interface ProductImage { id: string; url: string; is_primary: boolean; }
interface ProductVariant { id: string; name: string; value: string; price_delta: number; stock: number; }
interface Product {
  id: string; name: string; slug: string; description: string;
  price: number; compare_price?: number | null; stock: number; sku: string;
  images: ProductImage[]; variants: ProductVariant[];
  category?: { name: string; slug: string } | null;
}

export default function ProductDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<APIResponse<Product>>(`/api/products/${slug}`);
        if (res.success && res.data) {
          const data = res.data;
          data.variants = data.variants || [];
          data.images = data.images || [];
          setProduct(data);
          trackViewContent({
            id: data.id,
            name: data.name,
            price: data.price,
            category: data.category?.name,
          });

          // Fetch related products
          const categoryQuery = data.category?.slug ? `category=${data.category.slug}&` : "";
          api.get<PaginatedResponse<Product>>(`/api/products?${categoryQuery}limit=5`)
            .then(relRes => {
              setRelatedProducts((relRes.data || []).filter(p => p.id !== data.id).slice(0, 4));
            }).catch(() => {});
        }
      } catch { /* 404 */ }
      setLoading(false);
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="aspect-square skeleton rounded-2xl" />
          <div className="space-y-4">
            <div className="h-8 skeleton w-3/4" />
            <div className="h-6 skeleton w-1/3" />
            <div className="h-20 skeleton w-full" />
            <div className="h-12 skeleton w-1/2 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h1 className="font-heading text-2xl text-charcoal">Product not found</h1>
      </div>
    );
  }

  const activeVariant = (product.variants || []).find(v => v.id === selectedVariant);
  const finalPrice = product.price + (activeVariant?.price_delta || 0);
  const hasDiscount = product.compare_price && product.compare_price > product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.compare_price! - product.price) / product.compare_price!) * 100) : 0;
  const inStock = activeVariant ? activeVariant.stock > 0 : product.stock > 0;

  const handleAddToCart = async () => {
    setAdding(true);
    try {
      await addItem(product.id, selectedVariant || undefined, quantity);
      trackAddToCart({ id: product.id, name: product.name, price: finalPrice }, quantity);
    } catch { /* ignore */ }
    setAdding(false);
  };

  const handleBuyNow = async () => {
    setAdding(true);
    try {
      trackAddToCart({ id: product.id, name: product.name, price: finalPrice }, quantity);
      const params = new URLSearchParams({
        buyNowProduct: product.id,
        buyNowSlug: product.slug,
        buyNowQty: quantity.toString(),
      });
      if (selectedVariant) {
        params.append("buyNowVariant", selectedVariant);
      }
      router.push(`/checkout?${params.toString()}`);
    } catch { 
      setAdding(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Image Gallery */}
        <div>
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-cream-dark mb-3">
            {product.images.length > 0 ? (
              <Image
                src={product.images[selectedImage]?.url || product.images[0]?.url}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            {hasDiscount && (
              <span className="absolute top-4 left-4 bg-rose-gold text-white text-sm font-bold px-3 py-1.5 rounded-full">
                -{discountPercent}% OFF
              </span>
            )}
          </div>
          {/* Thumbnails */}
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {product.images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(i)}
                  className={`w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${i === selectedImage ? "border-rose-gold" : "border-transparent hover:border-gray-200"}`}
                >
                  <Image src={img.url} alt={`${product.name} ${i + 1}`} width={80} height={80} className="object-cover w-full h-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div>
          {product.category && (
            <p className="text-sm text-rose-gold font-medium mb-2">{product.category.name}</p>
          )}
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-charcoal mb-4">
            {product.name}
          </h1>

          {/* Price */}
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-bold text-rose-gold">৳{finalPrice.toLocaleString()}</span>
            {hasDiscount && (
              <span className="text-lg text-charcoal-lighter line-through">
                ৳{product.compare_price!.toLocaleString()}
              </span>
            )}
          </div>

          {/* Stock */}
          <div className="mb-6">
            {inStock ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                In Stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-red-500">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                Out of Stock
              </span>
            )}
          </div>

          {/* Variants */}
          {product.variants.length > 0 && (
            <div className="mb-6">
              <h3 className="input-label">{product.variants[0]?.name || "Option"}</h3>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v.id === selectedVariant ? null : v.id)}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                      v.id === selectedVariant
                        ? "border-rose-gold bg-rose-gold/10 text-rose-gold font-medium"
                        : "border-gray-200 text-charcoal hover:border-rose-gold/50"
                    } ${v.stock <= 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                    disabled={v.stock <= 0}
                  >
                    {v.value}
                    {v.price_delta !== 0 && (
                      <span className="ml-1 text-xs opacity-70">
                        ({v.price_delta > 0 ? "+" : ""}৳{v.price_delta})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="mb-6">
            <h3 className="input-label">Quantity</h3>
            <div className="flex items-center gap-3">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-cream-dark transition-colors">−</button>
              <span className="w-12 text-center font-medium">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-cream-dark transition-colors">+</button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleAddToCart}
              disabled={!inStock || adding}
              className="w-full py-3.5 text-base rounded-xl font-medium border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-rose-gold text-rose-gold hover:bg-rose-gold/5"
            >
              {adding ? "Processing..." : !inStock ? "Out of Stock" : "Add to Cart"}
            </button>
            <button
              onClick={handleBuyNow}
              disabled={!inStock || adding}
              className="btn-primary w-full py-4 text-base shadow-lg shadow-rose-gold/20"
            >
              {adding ? "Processing..." : "Buy Now"}
            </button>
          </div>

          {/* Description */}
          {product.description && (
            <div className="mt-8 border-t border-gray-100 pt-6">
              <h3 className="font-heading text-lg font-semibold text-charcoal mb-3">Description</h3>
              <div className="text-sm text-charcoal-lighter leading-relaxed whitespace-pre-line">
                {product.description}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div className="mt-20 pt-12 border-t border-gray-100">
          <h2 className="font-heading text-2xl font-bold text-charcoal mb-8 text-center">You May Also Like</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            {relatedProducts.map(p => (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <ProductCard key={p.id} product={p as any} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
