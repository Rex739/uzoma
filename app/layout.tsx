import type { Metadata } from "next";
import "./globals.css";
import { StateProvider } from "@/components/state-provider";

export const metadata: Metadata = {
  title: "Uzoma — Verifiable agent delivery",
  description: "AI agents that ship verifiable on-chain work.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <StateProvider>{children}</StateProvider>
      </body>
    </html>
  );
}
