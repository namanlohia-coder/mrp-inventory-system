"use client";

import { useEffect, useState } from "react";
import { getDashboardStats } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { StatCard, Badge, LoadingSpinner } from "@/components/ui";
import { formatCurrency, getStockStatus } from "@/lib/utils";
import type { Product, StockMovement, PurchaseOrder } from "@/types/database";

interface DashboardData {
  products: Product[];
  movements: StockMovement[];
  purchaseOrders: PurchaseOrder[];
  totalValue: number;
  totalUnits: number;
  lowStockItems: Product[];
  pendingPOs: PurchaseOrder[];
  draftPOs: PurchaseOrder[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!data) return <div className="p-8 text-gray-400">Failed to load dashboard data.</div>;

  const maxStock = Math.max(...data.products.map((p) => p.stock), 1);

  return (
    <>
      <Header lowStockCount={data.lowStockItems.length} />
      <main className="flex-1 overflow-auto p-8">
        {/* Stat Cards */}
        <div className="flex gap-4 flex-wrap mb-7">
          <StatCard
            label="Total Inventory Value"
            value={formatCurrency(data.totalValue)}
            sub={`${data.totalUnits.toLocaleString()} total units`}
            icon="📦"
            trend={12}
          />
          <StatCard
            label="Low Stock Alerts"
            value={data.lowStockItems.length}
            sub="Below reorder point"
            icon="⚠️"
          />
          <StatCard
            label="Pending Orders"
            value={data.pendingPOs.length}
            sub={`${data.draftPOs.length} drafts`}
            icon="📋"
          />
          <StatCard
            label="Products"
            value={data.products.length}
            icon="🏷️"
            trend={4}
          />
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Low Stock Alerts */}
          <div className="bg-surface-card border border-border rounded-[14px] p-6">
            <h3 className="text-[15px] font-bold text-gray-100 mb-4 flex items-center gap-2">
              <span className="text-amber-400">⚠</span> Low Stock Alerts
            </h3>
            {data.lowStockItems.length === 0 ? (
              <div className="text-gray-500 text-[13px] text-center py-5">
                All items above reorder point ✓
              </div>
            ) : (
              data.lowStockItems.map((p) => {
                const status = getStockStatus(p.stock, p.reorder_point);
                return (
                  <div
                    key={p.id}
                    className="flex justify-between items-center py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{p.image}</span>
                      <div>
                        <div className="text-[13px] font-semibold text-gray-100">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-gray-500">{p.sku}</div>
                      </div>
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
            <h3 className="text-[15px] font-bold text-gray-100 mb-4">
              📊 Recent Stock Movements
            </h3>
            {data.movements.map((m) => (
              <div
                key={m.id}
                className="flex justify-between items-center py-2.5 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      m.movement_type === "in"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {m.movement_type === "in" ? "+" : "−"}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-gray-100">
                      {m.product?.name || "Unknown"}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {m.reference} · {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div
                  className={`font-bold text-sm font-mono ${
                    m.movement_type === "in"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {m.movement_type === "in" ? "+" : "−"}
                  {m.quantity}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inventory Level Bars */}
        <div className="bg-surface-card border border-border rounded-[14px] p-6 mt-5">
          <h3 className="text-[15px] font-bold text-gray-100 mb-5">
            📈 Inventory Levels
          </h3>
          <div className="flex items-end gap-4 h-44">
            {data.products.map((p) => {
              const pct = (p.stock / maxStock) * 100;
              const isLow = p.stock <= p.reorder_point;
              return (
                <div
                  key={p.id}
                  className="flex-1 flex flex-col items-center gap-2"
                >
                  <span className="text-[11px] text-gray-400 font-semibold">
                    {p.stock}
                  </span>
                  <div
                    className="w-full rounded-t-lg transition-all duration-700"
                    style={{
                      height: `${Math.max(pct, 5)}%`,
                      minHeight: 8,
                      background: isLow
                        ? "linear-gradient(180deg, #F59E0B, rgba(245,158,11,0.3))"
                        : "linear-gradient(180deg, #6366F1, rgba(99,102,241,0.3))",
                    }}
                  />
                  <span className="text-[10px] text-gray-500 text-center max-w-[60px] leading-tight">
                    {p.name.split(" ").slice(0, 2).join(" ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
