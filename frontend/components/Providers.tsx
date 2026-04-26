"use client";

import { AuthProvider } from "@/lib/hooks/useAuth";
import { CartProvider } from "@/lib/hooks/useCart";
import { usePathname } from "next/navigation";
import PixelProvider from "@/components/tracking/PixelProvider";
import Navbar from "@/components/shop/Navbar";
import Footer from "@/components/shop/Footer";
import CartDrawer from "@/components/shop/CartDrawer";
import FloatingContactButtons from "@/components/shop/FloatingContactButtons";

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");

  return (
    <AuthProvider>
      <CartProvider>
        <PixelProvider />
        {!isAdminRoute && <Navbar />}
        {!isAdminRoute && <CartDrawer />}
        {!isAdminRoute && <FloatingContactButtons />}
        <main className="min-h-screen">{children}</main>
        {!isAdminRoute && <Footer />}
      </CartProvider>
    </AuthProvider>
  );
}
