"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDashboardStats, getSuppliers, getPurchaseOrdersTotal } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { StatCard, Badge, Button, LoadingSpinner } from "@/components/ui";
import { formatCurrency, getStockStatus } from "@/lib/utils";
import type { Product, StockMovement } from "@/types/database";

interface DashboardData {
  products: Product[];
  movements: StockMovement[];
  totalValue: number;
  totalUnits: number;
  lowStockItems: Product[];
  pendingPOs: { length: number };
  draftPOs: { length: number };
  totalPOs: number;
  categories: string[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [supplierCount, setSupplierCount] = useState(0);
  const [openPOTotal, setOpenPOTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getSuppliers(),
      getPurchaseOrdersTotal("ordered"),
    ])
      .then(([stats, sups, poTotal]) => {
        setData(stats as any);
        setSupplierCount(sups.length);
        setOpenPOTotal(poTotal);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!data) return <div className="p-8 text-gray-400">Failed to load dashboard data.</div>;

  return (
    <>
      <Header lowStockCount={data.lowStockItems.length} />
      <main className="flex-1 overflow-auto p-8">
        {/* Stat Cards */}
        <div className="flex gap-4 flex-wrap mb-7">
          <StatCard
            label="Total Inventory Value"
            value={formatCurrency(data.totalValue)}
            sub={data.totalUnits.toLocaleString() + " total units across " + data.products.length + " products"}
            icon="$"
          />
          <StatCard
            label="Open Purchase Orders"
            value={data.pendingPOs.length}
            sub={formatCurrency(openPOTotal) + " total value"}
            icon="P"
          />
          <StatCard
            label="Low Stock Alerts"
            value={data.lowStockItems.length}
            sub="Below reorder point"
            icon="!"
          />
          <StatCard
            label="Suppliers"
            value={supplierCount}
            sub={data.categories.length + " product categories"}
            icon="V"
          />
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 mb-7">
          <Button onClick={() => router.push("/purchase-orders")}>Create PO</Button>
          <Button variant="secondary" onClick={() => router.push("/inventory")}>View Inventory</Button>
          <Button variant="secondary" onClick={() => router.push("/reports")}>View Reports</Button>
          {data.lowStockItems.length > 0 && (
            <Button variant="danger" onClick={() => router.push("/inventory?filter=low")}>
              {data.lowStockItems.length} Low Stock Items
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Low Stock Alerts */}
          <div className="bg-surface-card border border-border rounded-[14px] p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[15px] font-bold text-gray-100 flex items-center gap-2">
                <span className="text-amber-400">!</span> Low Stock Alerts
              </h3>
              {data.lowStockItems.length > 0 && (
                <button onClick={() => router.push("/inventory?filter=low")} className="text-[12px] text-brand hover:underline bg-transparent border-none cursor-pointer">
                  View all
                </button>
              )}
            </div>
            {data.lowStockItems.length === 0 ? (
              <div className="text-gray-500 text-[13px] text-center py-5">All items above reorder point</div>
            ) : (
              data.lowStockItems.slice(0, 8).map((p) => {
                const status = getStockStatus(p.stock, p.reorder_point);
                const deficit = p.reorder_point - p.stock;
                return (
                  <div key={p.id} className="flex justify-between items-center py-3 border-b border-border last:border-0">
                    <div>
                      <div className="text-[13px] font-semibold text-gray-100">{p.name}</div>
                      <div className="text-[11px] text-gray-500">{p.sku} | Need {deficit > 0 ? deficit : 0} more</div>
                    </div>
                    <Badge color={status.color as any}>
                      {p.stock} / {p.reorder_point} {p.unit}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-surface-card border border-border rounded-[14px] p-6">
            <h3 className="text-[15px] font-bold text-gray-100 mb-4">Recent Stock Movements</h3>
            {data.movements.length === 0 ? (
              <div className="text-gray-500 text-[13px] text-center py-5">No recent movements</div>
            ) : (
              data.movements.map((m) => (
                <div key={m.id} className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className={"w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold " +
                      (m.movement_type === "in" ? "bg-emerald-500/10 text-emerald-400" :
                       m.movement_type === "out" ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400")}>
                      {m.movement_type === "in" ? "+" : m.movement_type === "out" ? "-" : "~"}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-gray-100">{m.product?.name || "Unknown"}</div>
                      <div className="text-[11px] text-gray-500">{m.reference} | {new Date(m.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className={"font-bold text-sm font-mono " +
                    (m.movement_type === "in" ? "text-emerald-400" : m.movement_type === "out" ? "text-red-400" : "text-blue-400")}>
                    {m.movement_type === "in" ? "+" : m.movement_type === "out" ? "-" : "~"}{m.quantity}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Inventory Level Bars */}
        {data.products.length > 0 && data.products.length <= 50 && (
          <div className="bg-surface-card border border-border rounded-[14px] p-6 mt-5">
            <h3 className="text-[15px] font-bold text-gray-100 mb-5">Inventory Levels</h3>
            <div className="flex items-end gap-4 h-44">
              {data.products.slice(0, 30).map((p) => {
                const maxStock = Math.max(...data.products.map((pr) => pr.stock), 1);
                const pct = (p.stock / maxStock) * 100;
                const isLow = p.stock <= p.reorder_point;
                return (
                  <div key={p.id} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-[11px] text-gray-400 font-semibold">{p.stock}</span>
                    <div className="w-full rounded-t-lg transition-all duration-700"
                      style={{
                        height: Math.max(pct, 5) + "%", minHeight: 8,
                        background: isLow
                          ? "linear-gradient(180deg, #F59E0B, rgba(245,158,11,0.3))"
                          : "linear-gradient(180deg, #6366F1, rgba(99,102,241,0.3))",
                      }} />
                    <span className="text-[10px] text-gray-500 text-center max-w-[60px] leading-tight">
                      {p.name.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
