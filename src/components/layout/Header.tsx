"use client";

import { usePathname, useRouter } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/inventory": "Inventory",
  "/purchase-orders": "Purchase Orders",
  "/stock-movements": "Stock Movements",
  "/suppliers": "Suppliers",
  "/customers": "Customers",
  "/katana-sync": "Katana Sync",
  "/csv-import": "CSV Import",
  "/reports": "Reports",
};

export function Header({ lowStockCount }: { lowStockCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = PAGE_TITLES[pathname] || "MRP System";

  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-border">
      <h1 className="text-xl font-bold text-gray-100">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-sm font-bold">
          N
        </div>
      </div>
    </header>
  );
}
