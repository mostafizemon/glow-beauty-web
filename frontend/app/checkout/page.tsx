"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api, { APIResponse } from "@/lib/api";
import { useCart } from "@/lib/hooks/useCart";
import CheckoutForm from "@/components/shop/CheckoutForm";

interface SiteSettings {
  delivery_enabled: string;
  delivery_charge: string;
  delivery_free_above: string;
  [key: string]: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  images: { url: string; is_primary: boolean }[];
  variants: { id: string; name: string; value: string; price_delta: number }[];
}

interface PurchaseItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const buyNowSlug = searchParams.get("buyNowSlug");
  const buyNowVariantId = searchParams.get("buyNowVariant");
  const buyNowQty = parseInt(searchParams.get("buyNowQty") || "1", 10);

  const { items: cartItems, subtotal: cartSubtotal, isLoading: cartLoading } = useCart();
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [buyNowItem, setBuyNowItem] = useState<any>(null);
  const [loadingBuyNow, setLoadingBuyNow] = useState(!!buyNowSlug);

  useEffect(() => {
    api.get<APIResponse<SiteSettings>>("/api/settings/public").then(res => {
      if (res.success && res.data) setSettings(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    if (buyNowSlug) {
      setLoadingBuyNow(true);
      api.get<APIResponse<Product>>(`/api/products/${buyNowSlug}`).then(res => {
        if (!active) return;
        if (res.success && res.data) {
          const product = res.data;
          const variant = product.variants?.find(v => v.id === buyNowVariantId);
          setBuyNowItem({
            id: "buy_now_temp",
            product_id: product.id,
            variant_id: variant?.id,
            quantity: buyNowQty,
            product: product,
            variant: variant,
          });
        }
        setLoadingBuyNow(false);
      }).catch(() => {
        if (active) setLoadingBuyNow(false);
      });
    }
    return () => { active = false; };
  }, [buyNowSlug, buyNowVariantId, buyNowQty]);

  const isLoading = cartLoading || loadingBuyNow;
  const isBuyNowMode = !!buyNowItem;
  
  const displayItems = isBuyNowMode ? [buyNowItem] : cartItems;
  const displaySubtotal = isBuyNowMode 
    ? ((buyNowItem.product?.price || 0) + (buyNowItem.variant?.price_delta || 0)) * buyNowQty
    : cartSubtotal;

  if (isLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-12"><div className="h-96 skeleton rounded-xl" /></div>;
  }

  if (displayItems.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <h1 className="font-heading text-2xl font-bold text-charcoal mb-3">Your cart is empty</h1>
        <Link href="/products" className="btn-primary mt-4">Browse Products</Link>
      </div>
    );
  }

  const deliveryEnabled = settings?.delivery_enabled === "true";
  const deliveryCharge = deliveryEnabled ? parseFloat(settings?.delivery_charge || "0") : 0;
  const freeAbove = parseFloat(settings?.delivery_free_above || "0");
  const actualDelivery = freeAbove > 0 && displaySubtotal >= freeAbove ? 0 : deliveryCharge;
  const total = displaySubtotal + actualDelivery;
  const purchaseItems: PurchaseItem[] = displayItems.map(item => {
    const price = (item.product?.price || 0) + (item.variant?.price_delta || 0);
    return {
      id: item.product_id,
      name: item.product?.name || "",
      price,
      quantity: item.quantity,
    };
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <h1 className="font-heading text-3xl font-bold text-charcoal mb-8">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form */}
        <div className="lg:col-span-3">
          <div className="card p-6">
            <h2 className="font-heading text-xl font-semibold text-charcoal mb-6">Delivery Information</h2>
            <CheckoutForm 
              subtotal={displaySubtotal} 
              deliveryCharge={actualDelivery} 
              total={total}
              checkoutMode={isBuyNowMode ? "buy_now" : "cart"}
              buyNowProduct={isBuyNowMode ? buyNowItem.product_id : undefined}
              buyNowVariant={isBuyNowMode ? buyNowItem.variant_id : undefined}
              buyNowQty={isBuyNowMode ? buyNowItem.quantity : undefined}
              purchaseItems={purchaseItems}
            />
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-2">
          <div className="card p-6 sticky top-24">
            <h2 className="font-heading text-xl font-semibold text-charcoal mb-4">Order Summary</h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {displayItems.map(item => {
                const imageUrl = item.product?.images?.[0]?.url || "";
                const price = (item.product?.price || 0) + (item.variant?.price_delta || 0);
                return (
                  <div key={item.id} className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-14 h-14 relative rounded-lg overflow-hidden bg-cream-dark flex-shrink-0">
                      {imageUrl ? (
                        <Image src={imageUrl} alt={item.product?.name || ""} fill className="object-cover" sizes="56px" />
                      ) : (
                        <div className="w-full h-full bg-cream-dark" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal line-clamp-1">{item.product?.name}</p>
                      {item.variant && <p className="text-xs text-charcoal-lighter">{item.variant.value}</p>}
                      <p className="text-sm text-charcoal-lighter">৳{price.toLocaleString()} × {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold text-charcoal">৳{(price * item.quantity).toLocaleString()}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-charcoal-lighter">Subtotal</span><span>৳{displaySubtotal.toLocaleString()}</span></div>
              <div className="flex justify-between">
                <span className="text-charcoal-lighter">Delivery</span>
                <span>{actualDelivery > 0 ? `৳${actualDelivery.toLocaleString()}` : <span className="text-emerald-500">Free</span>}</span>
              </div>
              {freeAbove > 0 && displaySubtotal < freeAbove && (
                <p className="text-xs text-rose-gold">
                  Add ৳{(freeAbove - displaySubtotal).toLocaleString()} more for free delivery!
                </p>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100">
                <span>Total</span><span className="text-rose-gold">৳{total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-12"><div className="h-96 skeleton rounded-xl" /></div>}>
      <CheckoutContent />
    </Suspense>
  );
}
