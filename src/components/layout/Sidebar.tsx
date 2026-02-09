"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "◉" },
  { href: "/inventory", label: "Inventory", icon: "☰" },
  { href: "/purchase-orders", label: "Purchase Orders", icon: "◫" },
  { href: "/stock-movements", label: "Stock Movements", icon: "⇅" },
  { href: "/suppliers", label: "Suppliers", icon: "◎" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "bg-surface border-r border-border flex flex-col transition-all duration-200",
        collapsed ? "w-16 min-w-16" : "w-60 min-w-60"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-3 border-b border-border",
          collapsed ? "px-3 py-5" : "px-5 py-5"
        )}
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-purple-500 flex items-center justify-center text-base font-bold text-white shrink-0">
          M
        </div>
        {!collapsed && (
          <span className="font-bold text-base text-gray-100 whitespace-nowrap">
            MRP System
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl border-none text-[13px] font-medium transition-all duration-150 no-underline",
                collapsed ? "p-3 justify-center" : "px-3.5 py-2.5",
                active
                  ? "bg-brand-bg text-brand"
                  : "text-gray-400 hover:text-gray-200 hover:bg-surface-hover"
              )}
              title={item.label}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {!collapsed && (
                <span className="whitespace-nowrap">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-4 border-t border-border bg-transparent text-gray-500 cursor-pointer text-sm font-sans hover:text-gray-300 transition-colors"
      >
        {collapsed ? "→" : "← Collapse"}
      </button>
    </div>
  );
}
