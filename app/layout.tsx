import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brutus ver. Alpha 0.19",
  description: "Lead intelligence dla zespołu sprzedaży",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-[#f6f5f0] text-slate-900 antialiased selection:bg-indigo-200 selection:text-indigo-950">
        {children}
      </body>
    </html>
  );
}
