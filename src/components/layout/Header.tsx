"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";

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
  "/production": "Production",
  "/production-timeline": "Production Timeline",
};

export function Header({ lowStockCount }: { lowStockCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = PAGE_TITLES[pathname] || "MRP System";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-border">
      <h1 className="text-xl font-bold text-gray-100">{title}</h1>
      <div className="flex items-center gap-3">
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-sm font-bold cursor-pointer border-none hover:opacity-80 transition-opacity"
          >
            N
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-40 bg-[#151D2E] border border-[#1E293B] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
              <div className="px-3 py-2 border-b border-[#1E293B]">
                <div className="text-[11px] text-gray-500">Signed in as</div>
                <div className="text-[12px] text-gray-300 font-medium truncate">Naman</div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer bg-transparent border-none"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
