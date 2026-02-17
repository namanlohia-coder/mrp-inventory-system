import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { LayoutInner } from "@/components/layout/LayoutInner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MRP Inventory System",
  description: "Inventory management for Skyfront Corp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-surface text-gray-100`}>
        <AuthGuard>
          <LayoutInner>{children}</LayoutInner>
        </AuthGuard>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#1A1F2E",
              color: "#E5E7EB",
              border: "1px solid #2A2F3E",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
