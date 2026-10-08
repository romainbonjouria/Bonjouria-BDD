import type { Metadata } from "next";
import { Lora, Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-poppins" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora" });

export const metadata: Metadata = {
  title: "BONJOUR IA — Annuaire",
  icons: { icon: "https://bonjouria.fr/wp-content/uploads/2026/04/favicon.png" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${poppins.variable} ${lora.variable}`}>
      <body className="min-h-screen bg-pampas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
