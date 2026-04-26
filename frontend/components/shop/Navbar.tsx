"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/hooks/useAuth";
import { useCart } from "@/lib/hooks/useCart";

export default function Navbar() {
  const { customer, isLoggedIn, logout } = useAuth();
  const { cartCount, openDrawer } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center group relative h-10 w-40 md:h-12 md:w-48">
            <Image src="/logo.png" alt="Glow Beauty Goals" fill className="object-contain object-left scale-[1.4] md:scale-[1.5] origin-left" priority />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/"
              className="text-sm font-medium text-charcoal-light hover:text-rose-gold transition-colors"
            >
              Home
            </Link>
            <Link
              href="/products"
              className="text-sm font-medium text-charcoal-light hover:text-rose-gold transition-colors"
            >
              Products
            </Link>
          </nav>

          {/* Right Icons */}
          <div className="flex items-center gap-3">
            {/* Account */}
            <div className="relative">
              <button
                onClick={() => setAccountOpen(!accountOpen)}
                className="p-2 rounded-full hover:bg-cream-dark transition-colors"
                aria-label="Account"
              >
                <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </button>
              {accountOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 animate-fade-in z-50">
                  {isLoggedIn ? (
                    <>
                      <p className="px-4 py-2 text-xs text-charcoal-lighter">
                        Hi, {customer?.name}
                      </p>
                      <Link href="/orders/history" className="block px-4 py-2 text-sm hover:bg-cream-dark transition-colors" onClick={() => setAccountOpen(false)}>
                        My Orders
                      </Link>
                      <button onClick={() => { logout(); setAccountOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-cream-dark transition-colors">
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/auth/login" className="block px-4 py-2 text-sm hover:bg-cream-dark transition-colors" onClick={() => setAccountOpen(false)}>
                        Login
                      </Link>
                      <Link href="/auth/register" className="block px-4 py-2 text-sm hover:bg-cream-dark transition-colors" onClick={() => setAccountOpen(false)}>
                        Register
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Cart */}
            <button
              onClick={openDrawer}
              className="relative p-2 rounded-full hover:bg-cream-dark transition-colors"
              aria-label="Cart"
            >
              <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-rose-gold text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-fade-in">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </button>

            {/* Mobile menu */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-full hover:bg-cream-dark transition-colors"
              aria-label="Menu"
            >
              <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 pb-4 animate-fade-in">
            <Link href="/" className="block py-3 text-sm font-medium text-charcoal hover:text-rose-gold" onClick={() => setMobileOpen(false)}>
              Home
            </Link>
            <Link href="/products" className="block py-3 text-sm font-medium text-charcoal hover:text-rose-gold" onClick={() => setMobileOpen(false)}>
              Products
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
