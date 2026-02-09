import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "MRP Inventory System",
  description: "Manufacturing Resource Planning & Inventory Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#1E293B",
              color: "#E2E8F0",
              borderRadius: "10px",
              border: "1px solid #2A3A52",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
