"use client";

import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { LoadingSpinner } from "@/components/ui";
import { getReportData, getProducts } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";

interface SupplierSpend {
  name: string;
  total: number;
  poCount: number;
}

interface MonthlySpend {
  month: string;
  total: number;
  poCount: number;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [receivedPOs, setReceivedPOs] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"supplier" | "monthly" | "inventory" | "category">("supplier");

  useEffect(() => {
    (async () => {
      try {
        const data = await getReportData();
        setReceivedPOs(data.receivedPOs);
        setProducts(data.products);
      } catch {
        toast.error("Failed to load report data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ─── SUPPLIER SPEND ───────────────────────
  const supplierSpend = useMemo(() => {
    const map = new Map<string, SupplierSpend>();
    receivedPOs.forEach((po) => {
      const name = po.supplier?.name || "Unknown";
      const existing = map.get(name) || { name, total: 0, poCount: 0 };
      existing.total += po.total_amount || 0;
      existing.poCount += 1;
      map.set(name, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [receivedPOs]);

  const topSupplierTotal = supplierSpend[0]?.total || 1;

  // ─── MONTHLY SPEND ────────────────────────
  const monthlySpend = useMemo(() => {
    const map = new Map<string, MonthlySpend>();
    receivedPOs.forEach((po) => {
      const date = po.received_date || po.created_at;
      if (!date) return;
      const d = new Date(date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
      const existing = map.get(key) || { month: label, total: 0, poCount: 0 };
      existing.total += po.total_amount || 0;
      existing.poCount += 1;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, v]) => v);
  }, [receivedPOs]);

  const maxMonthlySpend = Math.max(...monthlySpend.map((m) => m.total), 1);

  // ─── INVENTORY VALUATION ──────────────────
  const inventoryStats = useMemo(() => {
    const sorted = [...products]
      .map((p) => ({ ...p, value: p.stock * p.cost }))
      .sort((a, b) => b.value - a.value);
    const totalValue = sorted.reduce((s, p) => s + p.value, 0);
    const totalUnits = sorted.reduce((s, p) => s + p.stock, 0);
    const lowStock = sorted.filter((p) => p.stock <= p.reorder_point && p.reorder_point > 0);
    const zeroStock = sorted.filter((p) => p.stock === 0);
    return { sorted, totalValue, totalUnits, lowStock, zeroStock, top20: sorted.slice(0, 20) };
  }, [products]);

  // ─── CATEGORY BREAKDOWN ───────────────────
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; totalValue: number; itemCount: number; totalUnits: number }>();
    products.forEach((p) => {
      const cat = p.category || "Uncategorized";
      const existing = map.get(cat) || { category: cat, totalValue: 0, itemCount: 0, totalUnits: 0 };
      existing.totalValue += p.stock * p.cost;
      existing.itemCount += 1;
      existing.totalUnits += p.stock;
      map.set(cat, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, [products]);

  const maxCategoryValue = categoryBreakdown[0]?.totalValue || 1;

  // ─── SUMMARY CARDS ────────────────────────
  const totalSpend = receivedPOs.reduce((s, po) => s + (po.total_amount || 0), 0);
  const avgPOValue = receivedPOs.length > 0 ? totalSpend / receivedPOs.length : 0;

  const lowStockCount = products.filter((p) => p.stock <= p.reorder_point).length;

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-100">Reports & Analytics</h1>
          <p className="text-[13px] text-gray-400 mt-1">Spending trends, inventory valuation, and supplier analysis</p>
        </div>

        {/* ─── SUMMARY CARDS ────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Total Spend (Received)</div>
            <div className="text-xl font-bold text-gray-100">{formatCurrency(totalSpend)}</div>
            <div className="text-[11px] text-gray-500 mt-1">{receivedPOs.length} POs</div>
          </div>
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Avg PO Value</div>
            <div className="text-xl font-bold text-gray-100">{formatCurrency(avgPOValue)}</div>
          </div>
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Inventory Value</div>
            <div className="text-xl font-bold text-gray-100">{formatCurrency(inventoryStats.totalValue)}</div>
            <div className="text-[11px] text-gray-500 mt-1">{inventoryStats.totalUnits.toLocaleString()} units</div>
          </div>
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Suppliers</div>
            <div className="text-xl font-bold text-gray-100">{supplierSpend.length}</div>
            <div className="text-[11px] text-gray-500 mt-1">{inventoryStats.lowStock.length} items low stock</div>
          </div>
        </div>

        {/* ─── TABS ─────────────────────────── */}
        <div className="flex gap-2 mb-6">
          {([
            ["supplier", "By Supplier"],
            ["monthly", "Monthly Trends"],
            ["inventory", "Inventory Valuation"],
            ["category", "By Category"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                activeTab === key
                  ? "bg-brand/20 border-brand text-brand"
                  : "bg-surface-card border-border text-gray-400 hover:border-border-light"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ─── SUPPLIER SPEND TAB ───────────── */}
        {activeTab === "supplier" && (
          <div className="bg-surface-card border border-border rounded-xl p-6">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Spending by Supplier ({supplierSpend.length} suppliers)
            </div>
            <div className="space-y-3">
              {supplierSpend.map((s, i) => (
                <div key={s.name} className="flex items-center gap-4">
                  <div className="text-[11px] text-gray-500 w-6 text-right">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <div className="font-semibold text-[13px] text-gray-100 truncate">{s.name}</div>
                      <div className="font-bold text-[13px] text-gray-100 ml-4 shrink-0">{formatCurrency(s.total)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-[#0B0F19] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                          style={{ width: `${(s.total / topSupplierTotal) * 100}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-gray-500 w-16 shrink-0">{s.poCount} POs</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── MONTHLY SPEND TAB ───────────── */}
        {activeTab === "monthly" && (
          <div className="bg-surface-card border border-border rounded-xl p-6">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Monthly Spending Trend
            </div>
            {monthlySpend.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">No received POs to analyze</div>
            ) : (
              <div className="space-y-2">
                {monthlySpend.map((m) => (
                  <div key={m.month} className="flex items-center gap-4">
                    <div className="text-[13px] text-gray-400 w-20 shrink-0">{m.month}</div>
                    <div className="flex-1 h-6 bg-[#0B0F19] rounded-lg overflow-hidden flex items-center">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-end pr-2"
                        style={{ width: `${Math.max((m.total / maxMonthlySpend) * 100, 8)}%` }}
                      >
                        {m.total / maxMonthlySpend > 0.3 && (
                          <span className="text-[10px] font-bold text-white whitespace-nowrap">{formatCurrency(m.total)}</span>
                        )}
                      </div>
                    </div>
                    {m.total / maxMonthlySpend <= 0.3 && (
                      <div className="text-[12px] font-bold text-gray-100 w-24 shrink-0">{formatCurrency(m.total)}</div>
                    )}
                    <div className="text-[11px] text-gray-500 w-12 shrink-0">{m.poCount} POs</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── INVENTORY VALUATION TAB ─────── */}
        {activeTab === "inventory" && (
          <div className="space-y-6">
            {/* Low stock alerts */}
            {inventoryStats.lowStock.length > 0 && (
              <div className="bg-surface-card border border-amber-500/30 rounded-xl p-6">
                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-4">
                  ⚠️ Low Stock Items ({inventoryStats.lowStock.length})
                </div>
                <div className="space-y-2">
                  {inventoryStats.lowStock.slice(0, 15).map((p) => (
                    <div key={p.id} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                      <div>
                        <div className="font-semibold text-[13px] text-gray-100">{p.name}</div>
                        <div className="text-[11px] text-gray-500">
                          {p.sku ? `[${p.sku}] · ` : ""}Stock: {p.stock} · Reorder point: {p.reorder_point}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-amber-400">{p.stock} left</div>
                    </div>
                  ))}
                  {inventoryStats.lowStock.length > 15 && (
                    <div className="text-[11px] text-gray-500 pt-2">+{inventoryStats.lowStock.length - 15} more items</div>
                  )}
                </div>
              </div>
            )}

            {/* Top 20 by value */}
            <div className="bg-surface-card border border-border rounded-xl p-6">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Top 20 Products by Inventory Value
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-border">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Product</th>
                      <th className="pb-2 pr-4 text-right">Stock</th>
                      <th className="pb-2 pr-4 text-right">Unit Cost</th>
                      <th className="pb-2 text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryStats.top20.map((p, i) => (
                      <tr key={p.id} className="border-b border-border/30">
                        <td className="py-2.5 pr-4 text-gray-500">{i + 1}</td>
                        <td className="py-2.5 pr-4 text-gray-100">
                          {p.name}
                          {p.sku && <span className="text-[11px] text-gray-500 ml-2">[{p.sku}]</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-300">{p.stock.toLocaleString()}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-300">{formatCurrency(p.cost)}</td>
                        <td className="py-2.5 text-right font-bold text-gray-100">{formatCurrency(p.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── CATEGORY BREAKDOWN TAB ─────── */}
        {activeTab === "category" && (
          <div className="bg-surface-card border border-border rounded-xl p-6">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Inventory by Category ({categoryBreakdown.length} categories)
            </div>
            <div className="space-y-3">
              {categoryBreakdown.map((c, i) => (
                <div key={c.category} className="flex items-center gap-4">
                  <div className="text-[11px] text-gray-500 w-6 text-right">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <div className="font-semibold text-[13px] text-gray-100 truncate">{c.category}</div>
                      <div className="font-bold text-[13px] text-gray-100 ml-4 shrink-0">{formatCurrency(c.totalValue)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-[#0B0F19] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                          style={{ width: `${(c.totalValue / maxCategoryValue) * 100}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-gray-500 w-24 shrink-0">{c.itemCount} items · {c.totalUnits.toLocaleString()} units</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
