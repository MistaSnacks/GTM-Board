import type { Metadata } from "next";
import { Caveat, Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// The d3a display face. The variable keeps the name that every component already reads.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-outfit",
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const hand = Caveat({
  weight: "600",
  subsets: ["latin"],
  variable: "--font-hand",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GTM Board",
  description: "Mission control for go-to-market",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${hand.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
