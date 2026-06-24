import type { Metadata } from "next";
import { Inter, Nova_Square } from "next/font/google"
import "./globals.css";
import { StateProvider } from "@/components/state-provider";

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
})


export const metadata: Metadata = {
  title: "Uzoma — Verifiable agent delivery",
  description: "AI agents that ship verifiable on-chain work.",
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
