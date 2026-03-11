"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { getProducts } from "@/lib/data";

export default function ProductionTimelinePage() {
  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    getProducts()
      .then((prods) => setLowStockCount(prods.filter((p: any) => p.stock <= p.reorder_point).length))
      .catch(() => {});
  }, []);

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl opacity-30">▦</div>
          <div className="text-[16px] font-semibold text-gray-300">Production Timeline</div>
          <div className="text-[13px] text-gray-500">Coming soon — categories will be added here.</div>
        </div>
      </main>
    </>
  );
}
