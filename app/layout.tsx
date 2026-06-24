import type { Metadata } from "next";
import { Inter, Nova_Square } from "next/font/google";
import "./globals.css";
import { StateProvider } from "@/components/state-provider";
import { UZOMA_BRAND_ASSETS } from "@/components/brand";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const novaSquare = Nova_Square({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Uzoma — Verifiable agent delivery",
  description: "AI agents that ship verifiable on-chain work.",
  icons: {
    icon: [
      {
        url: UZOMA_BRAND_ASSETS.appIcon,
        type: "image/png",
        sizes: "500x500",
      },
    ],
    shortcut: UZOMA_BRAND_ASSETS.appIcon,
    apple: [
      {
        url: UZOMA_BRAND_ASSETS.appIcon,
        type: "image/png",
        sizes: "500x500",
      },
    ],
  },
  openGraph: {
    title: "Uzoma — Verifiable agent delivery",
    description: "AI agents that ship verifiable on-chain work.",
    images: [
      {
        url: UZOMA_BRAND_ASSETS.appIcon,
        width: 500,
        height: 500,
        alt: "Uzoma app icon",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Uzoma — Verifiable agent delivery",
    description: "AI agents that ship verifiable on-chain work.",
    images: [UZOMA_BRAND_ASSETS.appIcon],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body
        className={`${inter.variable} ${novaSquare.variable} font-sans antialiased`}
      >
        <StateProvider>{children}</StateProvider>
      </body>
    </html>
  );
}
