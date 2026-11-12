import type { Metadata } from "next";
import { Caveat, Fraunces, Fredoka, Inter, JetBrains_Mono, Outfit } from "next/font/google";
import { getActiveProject } from "@/lib/config";
import { skinFor } from "@/lib/skin";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--face-outfit", display: "swap" });

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--face-fraunces",
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const fredoka = Fredoka({ subsets: ["latin"], variable: "--face-fredoka", display: "swap" });

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

const FONT_CLASSES = [outfit, fraunces, fredoka, hand, inter, jetbrainsMono]
  .map((font) => font.variable)
  .join(" ");

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const project = await getActiveProject();
  return (
    <html lang="en" data-project={project} data-skin={skinFor(project)} className={FONT_CLASSES}>
      <body className="font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
