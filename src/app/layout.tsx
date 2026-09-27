import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/lib/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Musikademy", template: "%s · Musikademy" },
  description: "Musikademy — Learn. Practice. Grow. La piattaforma didattica privata.",
  applicationName: "Musikademy",
  appleWebApp: { capable: true, title: "Musikademy", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false }, // piattaforma privata
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${inter.variable} h-full`}>
      {/* Le estensioni del browser (es. ColorZilla) aggiungono attributi al body prima dell'idratazione. */}
      <body className="min-h-full" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
