import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: "Luma — Attention Atlas",
    description: "A tactile daily-planning instrument for protecting your best attention.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Luma — Attention Atlas",
      description: "Make room for what matters.",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Luma Attention Atlas" }],
    },
    twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
