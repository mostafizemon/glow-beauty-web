import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import PixelInjector from "@/components/PixelInjector";

type SettingsResponse = {
  success: boolean;
  data?: Record<string, string>;
};

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

const defaultMetadata: Metadata = {
  title: "Glow & Beauty Goals — Premium Beauty Products",
  description:
    "Discover authentic beauty products for skincare, makeup, and haircare. Fast delivery across Bangladesh. Shop your glow today!",
  keywords: "beauty, skincare, makeup, haircare, Bangladesh, cosmetics, glow",
};

async function getPublicSettings() {
  const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/settings/public`, {
      cache: "no-store",
    });

    if (!res.ok) return {};

    const payload = (await res.json()) as SettingsResponse;
    return payload.success && payload.data ? payload.data : {};
  } catch {
    return {};
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const metaDomainVerification = settings.meta_domain_verification?.trim();

  if (!metaDomainVerification) return defaultMetadata;

  return {
    ...defaultMetadata,
    other: {
      "facebook-domain-verification": metaDomainVerification,
    },
  };
}

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
