"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/hooks/useCart";
import { trackInitiateCheckout } from "@/lib/tracking";

export default function CartPage() {
  const { items, subtotal, isLoading, updateItem, removeItem } = useCart();

  useEffect(() => {
    if (items.length > 0) {
      trackInitiateCheckout(
        items.map(i => ({
          id: i.product_id,
          name: i.product?.name || "",
          price: (i.product?.price || 0) + (i.variant?.price_delta || 0),
          quantity: i.quantity,
        })),
        subtotal
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 skeleton rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <svg className="w-24 h-24 mx-auto text-gray-200 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <h1 className="font-heading text-2xl font-bold text-charcoal mb-3">Your cart is empty</h1>
        <p className="text-charcoal-lighter mb-6">Looks like you haven&apos;t added anything yet</p>
        <Link href="/products" className="btn-primary">Browse Products</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <h1 className="font-heading text-3xl font-bold text-charcoal mb-8">Shopping Cart</h1>

      <div className="space-y-4">
        {items.map(item => {
          const imageUrl = item.product?.images?.[0]?.url || "";
          const price = (item.product?.price || 0) + (item.variant?.price_delta || 0);

          return (
            <div key={item.id} className="card p-4 flex gap-4">
              <div className="w-20 h-24 md:w-24 md:h-28 relative rounded-lg overflow-hidden bg-cream-dark flex-shrink-0">
                {imageUrl ? (
                  <Image src={imageUrl} alt={item.product?.name || ""} fill className="object-cover" sizes="96px" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="flex-1">
                <h3 className="font-medium text-charcoal">{item.product?.name}</h3>
                {item.variant && <p className="text-sm text-charcoal-lighter">{item.variant.name}: {item.variant.value}</p>}
                <p className="text-rose-gold font-semibold mt-1">৳{price.toLocaleString()}</p>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => item.quantity > 1 ? updateItem(item.id, item.quantity - 1) : removeItem(item.id)}
                      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-sm hover:bg-cream-dark"
                    >−</button>
                    <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                    <button onClick={() => updateItem(item.id, item.quantity + 1)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-sm hover:bg-cream-dark">+</button>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-charcoal">৳{(price * item.quantity).toLocaleString()}</span>
                    <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="card p-6 mt-6">
        <div className="flex justify-between items-center text-lg">
          <span className="text-charcoal-lighter">Subtotal</span>
          <span className="font-bold text-charcoal">৳{subtotal.toLocaleString()}</span>
        </div>
        <p className="text-sm text-charcoal-lighter mt-1">Delivery charges calculated at checkout</p>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Link href="/checkout" className="btn-primary flex-1 text-center">Proceed to Checkout</Link>
          <Link href="/products" className="btn-ghost flex-1 text-center">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );
}
