"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart, CartItem } from "@/lib/hooks/useCart";

export default function CartDrawer() {
  const { items, subtotal, cartCount, isDrawerOpen, closeDrawer, updateItem, removeItem } = useCart();

  if (!isDrawerOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-50 animate-fade-in" onClick={closeDrawer} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-heading text-xl font-semibold text-charcoal">
            Your Cart ({cartCount})
          </h2>
          <button onClick={closeDrawer} className="p-2 hover:bg-cream-dark rounded-full transition-colors">
            <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="text-center py-16">
              <svg className="w-20 h-20 mx-auto text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-charcoal-lighter font-medium">Your cart is empty</p>
              <button onClick={closeDrawer} className="btn-outline btn-sm mt-4">
                Continue Shopping
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <CartItemRow key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 px-6 py-4 space-y-3 bg-cream/50">
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-lighter">Subtotal</span>
              <span className="font-semibold text-charcoal">৳{subtotal.toLocaleString()}</span>
            </div>
            <p className="text-xs text-charcoal-lighter">Delivery charges calculated at checkout</p>
            <Link
              href="/cart"
              onClick={closeDrawer}
              className="btn-primary w-full text-center block"
            >
              View Cart & Checkout
            </Link>
            <button onClick={closeDrawer} className="btn-ghost w-full text-sm">
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function CartItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: CartItem;
  onUpdate: (id: string, qty: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const imageUrl = item.product?.images?.[0]?.url || "";
  const price = (item.product?.price || 0) + (item.variant?.price_delta || 0);

  return (
    <div className="flex gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="w-16 h-20 relative rounded-lg overflow-hidden bg-cream-dark flex-shrink-0">
        {imageUrl ? (
          <Image src={imageUrl} alt={item.product?.name || ""} fill className="object-cover" sizes="64px" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-charcoal line-clamp-1">{item.product?.name}</h4>
        {item.variant && (
          <p className="text-xs text-charcoal-lighter mt-0.5">{item.variant.name}: {item.variant.value}</p>
        )}
        <p className="text-sm font-semibold text-rose-gold mt-1">৳{price.toLocaleString()}</p>

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => item.quantity > 1 ? onUpdate(item.id, item.quantity - 1) : onRemove(item.id)}
            className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-xs hover:bg-cream-dark transition-colors"
          >
            −
          </button>
          <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
          <button
            onClick={() => onUpdate(item.id, item.quantity + 1)}
            className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-xs hover:bg-cream-dark transition-colors"
          >
            +
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="ml-auto p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
