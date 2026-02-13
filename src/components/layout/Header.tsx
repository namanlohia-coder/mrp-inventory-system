"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/purchase-orders", label: "Purchase Orders" },
  { href: "/csv-import", label: "CSV Import" },
  { href: "/stock-movements", label: "Stock Movements" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/reports", label: "Reports" },
];

export function Header({ lowStockCount }: { lowStockCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentPage = navLinks.find((l) => l.href === pathname);
  const title = currentPage?.label || "MRP System";

  return (
    <header className="px-8 py-3 border-b border-border bg-surface">
      <div className="flex justify-between items-center mb-2">
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
      </div>
      <nav className="flex gap-1 -mb-3">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-t-lg border-b-2 transition-all ${
              pathname === link.href
                ? "text-brand border-brand bg-brand/5"
                : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-surface-card"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
