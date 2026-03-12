"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const SECTIONS = [
  {
    key: "finance",
    label: "Finance",
    items: [
      { href: "/customers", label: "Customers", icon: "C" },
      { href: "/for-customs", label: "For Customs", icon: "F" },
      { href: "/inventory", label: "Inventory", icon: "I" },
      { href: "/prepaid-inventory", label: "Prepaid Inventory", icon: "$" },
      { href: "/purchase-orders", label: "Purchase Orders", icon: "P" },
      { href: "/reports", label: "Reports", icon: "R" },
      { href: "/suppliers", label: "Suppliers", icon: "V" },
    ],
  },
  {
    key: "production",
    label: "Production",
    items: [
      { href: "/production-orders", label: "Production Orders", icon: "O" },
      { href: "/parts-procurement", label: "Parts & Procurement", icon: "P" },
      { href: "/production-timeline", label: "Production Timeline", icon: "▦" },
    ],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ finance: true, production: true });
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const toggleSection = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

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
      <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.key} className="mb-1">
            {/* Section header — hidden when sidebar is collapsed */}
            {!collapsed && (
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between px-3 py-1.5 mb-0.5 bg-transparent border-none cursor-pointer group"
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 group-hover:text-gray-400 transition-colors">
                  {section.label}
                </span>
                <span className="text-[10px] text-gray-600 group-hover:text-gray-400 transition-colors">
                  {expanded[section.key] ? "▼" : "▶"}
                </span>
              </button>
            )}

            {/* Links — always shown in collapsed mode, toggled in expanded mode */}
            {(collapsed || expanded[section.key]) &&
              section.items.map((item) => {
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
          </div>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="mx-2 mb-1 px-3.5 py-2 rounded-xl text-[13px] font-medium text-red-400 hover:bg-red-500/10 bg-transparent border-none cursor-pointer transition-colors text-left"
      >
        {collapsed ? "X" : "Logout"}
      </button>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-4 border-t border-border bg-transparent text-gray-500 cursor-pointer text-sm font-sans hover:text-gray-300 transition-colors"
      >
        {collapsed ? ">" : "< Collapse"}
      </button>
    </div>
  );
}
