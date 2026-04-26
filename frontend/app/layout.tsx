import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import PixelInjector from "@/components/PixelInjector";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Glow & Beauty Goals — Premium Beauty Products",
  description:
    "Discover authentic beauty products for skincare, makeup, and haircare. Fast delivery across Bangladesh. Shop your glow today!",
  keywords: "beauty, skincare, makeup, haircare, Bangladesh, cosmetics, glow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="font-body antialiased">
        <PixelInjector />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
