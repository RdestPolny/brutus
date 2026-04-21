import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prezesol — Lead Intelligence",
  description: "Automatyczny brief przed rozmową sprzedażową",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
