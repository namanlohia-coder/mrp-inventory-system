"use client";

import { usePathname, useRouter } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/inventory": "Inventory",
  "/purchase-orders": "Purchase Orders",
  "/csv-import": "CSV Import",
  "/stock-movements": "Stock Movements",
  "/suppliers": "Suppliers",
  "/reports": "Reports",
};

export function Header({ lowStockCount }: { lowStockCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = pageTitles[pathname] || "MRP System";

  return (
    <header className="px-8 py-4 border-b border-border bg-surface flex justify-between items-center">
      <h1 className="text-xl font-bold text-gray-100 m-0">{title}</h1>
      <div className="flex items-center gap-4">
        {lowStockCount > 0 && (
          <button
            onClick={() => router.push("/inventory?filter=low")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20 cursor-pointer"
          >
            <span className="text-xs text-amber-400 font-semibold">
              ⚠ {lowStockCount} low stock
            </span>
          </button>
        )}
        <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-[13px] font-bold text-white">
          N
        </div>
      </div>
    </header>
  );
}
