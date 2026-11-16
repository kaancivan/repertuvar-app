import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Repertuar — Gitar & Bas Akor Defteri",
  description:
    "Minimalist, mobil odaklı kişisel gitar ve bas repertuar, transpoze ve sahne takip uygulaması.",
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="bg-[#121212] text-[#F8FAFC] font-sans antialiased selection:bg-teal-400/30 selection:text-teal-200">
        {children}
      </body>
    </html>
  );
}
