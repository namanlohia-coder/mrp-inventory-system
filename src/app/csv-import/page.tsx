"use client";

import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui";
import {
  getProducts,
  getNextPONumber,
  findOrCreateProduct,
  findOrCreateSupplier,
  createPurchaseOrder,
} from "@/lib/data";
import { formatCurrency } from "@/lib/utils";

interface ParsedLineItem {
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  total: number;
}

interface ParsedPO {
  poNumber: string;
  supplierName: string;
  createdDate: string;
  expectedDate: string;
  notes: string;
  lineItems: ParsedLineItem[];
  shipping: number;
  subtotal: number;
  total: number;
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

function parseKatanaCSV(csvText: string): ParsedPO[] {
  const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV file is empty or has no data rows");

  const headers = parseCSVLine(lines[0]);

  // Map Katana column names to indices
  const col = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const supplierCol = col("Contact Name");
  const poCol = col("Purchase Order No");
  const createdCol = col("Created Date");
  const expectedCol = col("Expected Arrival");
  const skuCol = col("Variant Code");
  const descCol = col("Description");
  const qtyCol = col("Quantity");
  const priceCol = col("Price Per Unit");
  const totalCol = col("Total Price Without Tax");
  const notesCol = col("Additional Info");

  // Group rows by PO number
  const poMap = new Map<string, { supplier: string; created: string; expected: string; notes: string; items: ParsedLineItem[]; shipping: number }>();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const poNumber = fields[poCol] || "";
    if (!poNumber) continue;

    if (!poMap.has(poNumber)) {
      poMap.set(poNumber, {
        supplier: fields[supplierCol] || "",
        created: fields[createdCol] || "",
        expected: fields[expectedCol] || "",
        notes: fields[notesCol] || "",
        items: [],
        shipping: 0,
      });
    }

    const po = poMap.get(poNumber)!;
    const description = (fields[descCol] || "").trim();
    const qty = parseFloat(fields[qtyCol] || "0") || 0;
    const price = parseFloat(fields[priceCol] || "0") || 0;
    const total = parseFloat(fields[totalCol] || "0") || 0;
    const sku = (fields[skuCol] || "").trim();

    if (description.toLowerCase() === "shipping") {
      po.shipping += total;
    } else if (description && qty > 0) {
      po.items.push({
        sku,
        name: description,
        quantity: qty,
        unitCost: price,
        total: total || qty * price,
      });
    }
  }

  // Convert to array
  const result: ParsedPO[] = [];
  for (const [poNumber, data] of poMap) {
    const subtotal = data.items.reduce((s, i) => s + i.total, 0);
    result.push({
      poNumber,
      supplierName: data.supplier,
      createdDate: data.created,
      expectedDate: data.expected,
      notes: data.notes,
      lineItems: data.items,
      shipping: data.shipping,
      subtotal,
      total: subtotal + data.shipping,
    });
  }

  return result;
}

export default function CSVImportPage() {
  const [dragOver, setDragOver] = useState(false);
  const [parsedPOs, setParsedPOs] = useState<ParsedPO[]>([]);
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ po: string; success: boolean; error?: string }[]>([]);
  const [expandedPO, setExpandedPO] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    try {
      const results = parseKatanaCSV(text);
      setParsedPOs(results);
      setSelectedPOs(new Set(results.map((p) => p.poNumber)));
      toast.success(`Parsed ${results.length} purchase orders`);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse CSV");
      console.error(err);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
    else toast.error("Please drop a CSV file");
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const togglePO = (poNum: string) => {
    const next = new Set(selectedPOs);
    if (next.has(poNum)) next.delete(poNum);
    else next.add(poNum);
    setSelectedPOs(next);
  };

  const toggleAll = () => {
    if (selectedPOs.size === parsedPOs.length) {
      setSelectedPOs(new Set());
    } else {
      setSelectedPOs(new Set(parsedPOs.map((p) => p.poNumber)));
    }
  };

  const handleImport = async () => {
    const toImport = parsedPOs.filter((p) => selectedPOs.has(p.poNumber));
    if (toImport.length === 0) return toast.error("Select at least one PO to import");

    setImporting(true);
    setImportProgress(0);
    const results: { po: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < toImport.length; i++) {
      const po = toImport[i];
      try {
        // Find or create supplier
        const supplierId = await findOrCreateSupplier(po.supplierName || "Unknown");

        // Find or create products and build line items
        const lineItems: { product_id: string; quantity: number; unit_cost: number }[] = [];
        for (const item of po.lineItems) {
          const productId = await findOrCreateProduct(item.name, item.sku, item.unitCost);
          lineItems.push({
            product_id: productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
          });
        }

        // Clean up notes - strip the tax/resale info that's already in the system
        let cleanNotes = po.notes
          .replace(/Federal Tax ID:\s*[\d-]+/gi, "")
          .replace(/Resale Certificate\s*\d+/gi, "")
          .replace(/Exempt from Sales Taxes/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();

        await createPurchaseOrder(
          {
            po_number: po.poNumber,
            supplier_id: supplierId,
            status: "ordered",
            expected_date: po.expectedDate || null,
            notes: cleanNotes || "",
          },
          lineItems
        );

        results.push({ po: po.poNumber, success: true });
      } catch (err: any) {
        results.push({ po: po.poNumber, success: false, error: err.message });
      }
      setImportProgress(i + 1);
    }

    setImportResults(results);
    setImporting(false);
    const successCount = results.filter((r) => r.success).length;
    toast.success(`Imported ${successCount}/${toImport.length} POs`);
  };

  const reset = () => {
    setParsedPOs([]);
    setSelectedPOs(new Set());
    setImportResults([]);
    setImportProgress(0);
    setExpandedPO(null);
  };

  const selectedTotal = parsedPOs
    .filter((p) => selectedPOs.has(p.poNumber))
    .reduce((s, p) => s + p.total, 0);

  return (
    <>
      <Header lowStockCount={0} />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-100">CSV Import</h1>
            <p className="text-[13px] text-gray-400 mt-1">Import purchase orders from Katana CSV exports</p>
          </div>
          {parsedPOs.length > 0 && (
            <Button variant="secondary" onClick={reset}>← Start Over</Button>
          )}
        </div>

        {/* ─── IMPORT RESULTS ─────────────── */}
        {importResults.length > 0 ? (
          <div className="space-y-4">
            <div className="bg-surface-card border border-emerald-500/30 rounded-xl p-6">
              <div className="text-lg font-bold text-gray-100 mb-2">
                Import Complete — {importResults.filter((r) => r.success).length}/{importResults.length} succeeded
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {importResults.map((r) => (
                  <div key={r.po} className={`flex justify-between items-center py-2 px-3 rounded-lg ${r.success ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                    <span className="text-[13px] font-mono text-gray-100">{r.po}</span>
                    {r.success ? (
                      <span className="text-[12px] text-emerald-400">✓ Imported</span>
                    ) : (
                      <span className="text-[12px] text-red-400">✕ {r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={reset}>Import More</Button>
              <Button onClick={() => window.location.href = "/purchase-orders"}>View Purchase Orders</Button>
            </div>
          </div>
        ) : parsedPOs.length === 0 ? (
          /* ─── DROP ZONE ─────────────────── */
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-16 text-center transition-all cursor-pointer ${
              dragOver ? "border-brand bg-brand/5" : "border-border hover:border-border-light"
            }`}
            onClick={() => document.getElementById("csv-file-input")?.click()}
          >
            <div className="text-4xl mb-4">📄</div>
            <div className="text-base font-semibold text-gray-100 mb-2">Drop your Katana CSV here</div>
            <div className="text-[13px] text-gray-400 mb-4">or click to browse files</div>
            <div className="text-[11px] text-gray-600">
              Export from Katana: Make → Purchase Orders → Export
            </div>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv,.tsv"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        ) : (
          /* ─── PREVIEW ─────────────────── */
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="bg-surface-card border border-border rounded-xl p-4 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPOs.size === parsedPOs.length}
                    onChange={toggleAll}
                    className="rounded border-border"
                  />
                  <span className="text-[13px] text-gray-400">Select all</span>
                </label>
                <span className="text-[13px] text-gray-400">
                  {selectedPOs.size} of {parsedPOs.length} POs selected
                </span>
                <span className="text-[14px] font-bold text-brand">{formatCurrency(selectedTotal)}</span>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={reset}>Cancel</Button>
                <Button onClick={handleImport} disabled={importing || selectedPOs.size === 0}>
                  {importing ? `Importing ${importProgress}/${selectedPOs.size}...` : `Import ${selectedPOs.size} POs`}
                </Button>
              </div>
            </div>

            {/* PO list */}
            <div className="space-y-2">
              {parsedPOs.map((po) => (
                <div key={po.poNumber} className="bg-surface-card border border-border rounded-xl overflow-hidden">
                  <div
                    className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-surface-hover transition-all"
                    onClick={() => setExpandedPO(expandedPO === po.poNumber ? null : po.poNumber)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPOs.has(po.poNumber)}
                      onChange={(e) => { e.stopPropagation(); togglePO(po.poNumber); }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-100 font-mono">{po.poNumber}</div>
                      <div className="text-[11px] text-gray-400">
                        {po.supplierName} · {po.lineItems.length} items · Expected {po.expectedDate || "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-gray-100">{formatCurrency(po.total)}</div>
                      {po.shipping > 0 && (
                        <div className="text-[11px] text-gray-500">incl. {formatCurrency(po.shipping)} shipping</div>
                      )}
                    </div>
                    <span className="text-gray-500 text-xs">{expandedPO === po.poNumber ? "▲" : "▼"}</span>
                  </div>

                  {expandedPO === po.poNumber && (
                    <div className="px-5 pb-4 border-t border-border/50">
                      <table className="w-full text-[12px] mt-3">
                        <thead>
                          <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide">
                            <th className="pb-2 pr-3">#</th>
                            <th className="pb-2 pr-3">SKU</th>
                            <th className="pb-2 pr-3">Item</th>
                            <th className="pb-2 pr-3 text-right">Qty</th>
                            <th className="pb-2 pr-3 text-right">Unit Cost</th>
                            <th className="pb-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {po.lineItems.map((item, i) => (
                            <tr key={i} className="border-t border-border/30">
                              <td className="py-1.5 pr-3 text-gray-500">{i + 1}</td>
                              <td className="py-1.5 pr-3 font-mono text-[10px] text-gray-500">{item.sku || "—"}</td>
                              <td className="py-1.5 pr-3 text-gray-200">{item.name}</td>
                              <td className="py-1.5 pr-3 text-right text-gray-300">{item.quantity}</td>
                              <td className="py-1.5 pr-3 text-right text-gray-300">{formatCurrency(item.unitCost)}</td>
                              <td className="py-1.5 text-right text-gray-100">{formatCurrency(item.total)}</td>
                            </tr>
                          ))}
                          {po.shipping > 0 && (
                            <tr className="border-t border-border/30">
                              <td className="py-1.5 pr-3 text-gray-500"></td>
                              <td className="py-1.5 pr-3"></td>
                              <td className="py-1.5 pr-3 text-gray-400 italic">Shipping</td>
                              <td className="py-1.5 pr-3"></td>
                              <td className="py-1.5 pr-3"></td>
                              <td className="py-1.5 text-right text-gray-100">{formatCurrency(po.shipping)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      {po.notes && (
                        <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-border/30">
                          Notes: {po.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
