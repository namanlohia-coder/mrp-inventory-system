"use client";

import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui";
import { getProducts, getSuppliers } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";

interface KatanaItem {
  name: string;
  sku: string;
  category: string;
  defaultSupplier: string;
  unit: string;
  avgCost: number;
  valueInStock: number;
  inStock: number;
  expected: number;
  committed: number;
  safetyStock: number;
  location: string;
}

interface SyncResult {
  name: string;
  sku: string;
  action: "created" | "updated" | "skipped" | "error";
  detail?: string;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.replace(/^"|"$/g, "").trim());
}

function parseKatanaInventoryCSV(csvText: string): KatanaItem[] {
  const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV file is empty or has no data rows");

  const headers = parseCSVLine(lines[0]);
  const col = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const nameCol = col("Name");
  const skuCol = col("Variant code / SKU");
  const categoryCol = col("Category");
  const supplierCol = col("Default supplier");
  const unitCol = col("Units of measure");
  const costCol = col("Average cost");
  const valueCol = col("Value in stock");
  const stockCol = col("In stock");
  const expectedCol = col("Expected");
  const committedCol = col("Committed");
  const safetyCol = col("Safety stock");
  const locationCol = col("Location");

  const items: KatanaItem[] = [];
  const f = (fields: string[], idx: number, fallback = "") => {
    if (idx < 0 || idx >= fields.length) return fallback;
    return (fields[idx] || fallback) + "";
  };

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const name = f(fields, nameCol).trim();
    if (!name) continue;

    items.push({
      name,
      sku: f(fields, skuCol).trim(),
      category: f(fields, categoryCol).trim(),
      defaultSupplier: f(fields, supplierCol).trim(),
      unit: f(fields, unitCol, "ea").trim() || "ea",
      avgCost: parseFloat(f(fields, costCol, "0")) || 0,
      valueInStock: parseFloat(f(fields, valueCol, "0")) || 0,
      inStock: parseFloat(f(fields, stockCol, "0")) || 0,
      expected: parseFloat(f(fields, expectedCol, "0")) || 0,
      committed: parseFloat(f(fields, committedCol, "0")) || 0,
      safetyStock: parseFloat(f(fields, safetyCol, "0")) || 0,
      location: f(fields, locationCol).trim(),
    });
  }
  return items;
}

export default function KatanaSyncPage() {
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<KatanaItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    try {
      const parsed = parseKatanaInventoryCSV(text);
      setItems(parsed);
      toast.success(`Parsed ${parsed.length} inventory items`);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse CSV");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress(0);
    const results: SyncResult[] = [];

    try {
      // Load existing products and suppliers for matching
      const existingProducts = await getProducts();
      const existingSuppliers = await getSuppliers();

      // Build lookup maps
      const productBySku = new Map<string, any>();
      const productByName = new Map<string, any>();
      existingProducts.forEach((p) => {
        if (p.sku) productBySku.set(p.sku.toLowerCase(), p);
        productByName.set(p.name.toLowerCase().trim(), p);
      });

      const supplierByName = new Map<string, string>();
      existingSuppliers.forEach((s) => {
        supplierByName.set(s.name.toLowerCase().trim(), s.id);
      });

      const BATCH_SIZE = 50;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          // Find matching product
          let existing = null;
          if (item.sku) {
            existing = productBySku.get(item.sku.toLowerCase());
          }
          if (!existing) {
            existing = productByName.get(item.name.toLowerCase().trim());
          }

          // Find or create supplier
          let supplierId: string | null = null;
          if (item.defaultSupplier) {
            const lowerSupplier = item.defaultSupplier.toLowerCase().trim();
            supplierId = supplierByName.get(lowerSupplier) || null;
            if (!supplierId) {
              const { data: newSupplier } = await supabase
                .from("suppliers")
                .insert({ name: item.defaultSupplier, is_active: true } as any)
                .select("id")
                .single();
              if (newSupplier) {
                supplierId = newSupplier.id;
                supplierByName.set(lowerSupplier, newSupplier.id);
              }
            }
          }

          const updates: any = {
            cost: item.avgCost,
            stock: Math.round(item.inStock),
            category: item.category || undefined,
            unit: item.unit,
            value_in_stock: item.valueInStock,
            expected_qty: item.expected,
            committed_qty: item.committed,
            safety_stock: item.safetyStock,
            location: item.location,
          };
          if (supplierId) updates.default_supplier_id = supplierId;

          // Remove undefined values
          Object.keys(updates).forEach((k) => {
            if (updates[k] === undefined || updates[k] === "") delete updates[k];
          });

          if (existing) {
            // Update existing product
            const { error } = await supabase
              .from("products")
              .update(updates)
              .eq("id", existing.id);
            if (error) throw error;
            results.push({ name: item.name, sku: item.sku, action: "updated" });
          } else {
            // Create new product
            const { error } = await supabase
              .from("products")
              .insert({
                name: item.name,
                sku: item.sku || "",
                is_active: true,
                price: 0,
                reorder_point: Math.round(item.safetyStock) || 0,
                image: "📦",
                ...updates,
              } as any);
            if (error) throw error;
            // Add to lookup maps so duplicates in same CSV don't create doubles
            if (item.sku) productBySku.set(item.sku.toLowerCase(), { id: "new" });
            productByName.set(item.name.toLowerCase().trim(), { id: "new" });
            results.push({ name: item.name, sku: item.sku, action: "created" });
          }
        } catch (err: any) {
          results.push({ name: item.name, sku: item.sku, action: "error", detail: err.message });
        }

        setSyncProgress(i + 1);
      }
    } catch (err: any) {
      toast.error("Sync failed: " + err.message);
    }

    setSyncResults(results);
    setSyncing(false);
    const created = results.filter((r) => r.action === "created").length;
    const updated = results.filter((r) => r.action === "updated").length;
    const errors = results.filter((r) => r.action === "error").length;
    toast.success(`Sync complete: ${updated} updated, ${created} created, ${errors} errors`);
  };

  const reset = () => {
    setItems([]);
    setSyncResults([]);
    setSyncProgress(0);
  };

  // Stats
  const totalValue = items.reduce((s, i) => s + i.valueInStock, 0);
  const withStock = items.filter((i) => i.inStock > 0).length;
  const suppliers = [...new Set(items.map((i) => i.defaultSupplier).filter(Boolean))].sort();
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();

  // Filter items for preview
  const filtered = items.filter((item) => {
    const matchSearch = !search || (item.name + item.sku).toLowerCase().includes(search.toLowerCase());
    const matchSupplier = filterSupplier === "all" || item.defaultSupplier === filterSupplier;
    const matchCategory = filterCategory === "all" || item.category === filterCategory;
    return matchSearch && matchSupplier && matchCategory;
  });

  const lowStockCount = 0; // We don't load products on this page

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-100">Katana Inventory Sync</h1>
            <p className="text-[13px] text-gray-400 mt-1">Import and sync materials from Katana stock exports</p>
          </div>
          {items.length > 0 && (
            <Button variant="secondary" onClick={reset}>← Start Over</Button>
          )}
        </div>

        {/* ─── RESULTS ──────────────────── */}
        {syncResults.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-surface-card border border-emerald-500/30 rounded-xl p-5 text-center">
                <div className="text-2xl font-bold text-emerald-400">{syncResults.filter((r) => r.action === "updated").length}</div>
                <div className="text-[12px] text-gray-400">Updated</div>
              </div>
              <div className="bg-surface-card border border-blue-500/30 rounded-xl p-5 text-center">
                <div className="text-2xl font-bold text-blue-400">{syncResults.filter((r) => r.action === "created").length}</div>
                <div className="text-[12px] text-gray-400">Created</div>
              </div>
              <div className="bg-surface-card border border-red-500/30 rounded-xl p-5 text-center">
                <div className="text-2xl font-bold text-red-400">{syncResults.filter((r) => r.action === "error").length}</div>
                <div className="text-[12px] text-gray-400">Errors</div>
              </div>
            </div>

            {syncResults.filter((r) => r.action === "error").length > 0 && (
              <div className="bg-surface-card border border-red-500/30 rounded-xl p-4 max-h-[300px] overflow-y-auto">
                <div className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Errors</div>
                {syncResults.filter((r) => r.action === "error").map((r, i) => (
                  <div key={i} className="text-[12px] text-gray-300 py-1 border-b border-border/30 last:border-0">
                    <span className="font-mono text-gray-500">{r.sku || "—"}</span> {r.name}: <span className="text-red-400">{r.detail}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={reset}>Sync Again</Button>
              <Button onClick={() => window.location.href = "/inventory"}>View Inventory</Button>
            </div>
          </div>
        ) : items.length === 0 ? (
          /* ─── DROP ZONE ─────────────────── */
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-16 text-center transition-all cursor-pointer ${
              dragOver ? "border-brand bg-brand/5" : "border-border hover:border-border-light"
            }`}
            onClick={() => document.getElementById("katana-file-input")?.click()}
          >
            <div className="text-4xl mb-4">📦</div>
            <div className="text-base font-semibold text-gray-100 mb-2">Drop your Katana Inventory CSV here</div>
            <div className="text-[13px] text-gray-400 mb-4">or click to browse files</div>
            <div className="text-[11px] text-gray-600">
              Export from Katana: Stock → Inventory → Materials → Export
            </div>
            <input
              id="katana-file-input"
              type="file"
              accept=".csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="hidden"
            />
          </div>
        ) : (
          /* ─── PREVIEW ──────────────────── */
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-surface-card border border-border rounded-xl p-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Total Items</div>
                <div className="text-xl font-bold text-gray-100">{items.length.toLocaleString()}</div>
              </div>
              <div className="bg-surface-card border border-border rounded-xl p-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">In Stock</div>
                <div className="text-xl font-bold text-gray-100">{withStock.toLocaleString()}</div>
              </div>
              <div className="bg-surface-card border border-border rounded-xl p-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Total Value</div>
                <div className="text-xl font-bold text-brand">{formatCurrency(totalValue)}</div>
              </div>
              <div className="bg-surface-card border border-border rounded-xl p-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Suppliers</div>
                <div className="text-xl font-bold text-gray-100">{suppliers.length}</div>
              </div>
            </div>

            {/* Filters + Sync */}
            <div className="bg-surface-card border border-border rounded-xl p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search name or SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 w-56 focus:outline-none focus:border-brand"
                />
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="bg-[#0B0F19] border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-gray-400"
                >
                  <option value="all">All suppliers</option>
                  {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-[#0B0F19] border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-gray-400"
                >
                  <option value="all">All categories</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="text-[12px] text-gray-500">{filtered.length} items</span>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={reset}>Cancel</Button>
                <Button onClick={handleSync} disabled={syncing}>
                  {syncing ? `Syncing ${syncProgress}/${items.length}...` : `Sync ${items.length} Items`}
                </Button>
              </div>
            </div>

            {/* Items table */}
            <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-surface-card z-10">
                    <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-border">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((item, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-surface-hover">
                        <td className="px-4 py-2.5 text-gray-100 max-w-[300px] truncate">{item.name}</td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-gray-400">{item.sku || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-[12px]">{item.category || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-[12px]">{item.defaultSupplier || "—"}</td>
                        <td className="px-4 py-2.5 text-right text-gray-300">{formatCurrency(item.avgCost)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-100">{Math.round(item.inStock)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-100">{formatCurrency(item.valueInStock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 200 && (
                  <div className="text-center py-3 text-[12px] text-gray-500">
                    Showing 200 of {filtered.length} items
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
