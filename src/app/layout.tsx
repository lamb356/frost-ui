import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/ui/header";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FROST Multi-Sig | Zcash Threshold Signing",
  description: "Secure threshold signature coordination for Zcash using FROST protocol",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100 min-h-screen`}
      >
        <Providers>
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <footer className="border-t border-gray-800 py-6">
              <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
                <p>FROST Multi-Signature for Zcash</p>
                <p className="mt-1">Powered by FROST threshold signatures</p>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
