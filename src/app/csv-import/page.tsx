"use client";

import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Button, Modal } from "@/components/ui";
import {
  getProducts,
  getSuppliers,
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
  unit: string;
  expectedDate: string;
}

interface ParsedPO {
  poNumber: string;
  supplierName: string;
  expectedDate: string;
  notes: string;
  lineItems: ParsedLineItem[];
  additionalCosts: number;
  subtotal: number;
  total: number;
}

function parseKatanaCSV(csvText: string): ParsedPO {
  const lines = csvText.split("\n").map((l) => l.trim());
  
  // Katana CSV format has headers in first row
  // Try to detect format by looking at headers
  const headerLine = lines[0] || "";
  const headers = headerLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  
  // Find column indices
  const colIndex = (names: string[]) => {
    for (const name of names) {
      const idx = headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const skuCol = colIndex(["SKU", "Item SKU", "Variant code"]);
  const nameCol = colIndex(["Item", "Product", "Item name", "Name"]);
  const qtyCol = colIndex(["Quantity", "Qty"]);
  const unitCostCol = colIndex(["Price", "Unit cost", "Unit price", "Price per unit"]);
  const totalCol = colIndex(["Total", "Total cost", "Amount"]);
  const unitCol = colIndex(["Unit"]);
  const arrivalCol = colIndex(["Expected", "arrival", "Exp. arrival", "Expected arrival"]);
  const supplierCol = colIndex(["Supplier"]);
  const poNumberCol = colIndex(["PO number", "PO #", "Purchase order"]);
  const notesCol = colIndex(["Notes", "Additional info"]);

  // Parse data rows
  const lineItems: ParsedLineItem[] = [];
  let supplierName = "";
  let poNumber = "";
  let expectedDate = "";
  let notes = "";
  let additionalCosts = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Parse CSV respecting quoted fields
    const fields = parseCSVLine(line);
    
    const sku = skuCol >= 0 ? (fields[skuCol] || "").trim() : "";
    const name = nameCol >= 0 ? (fields[nameCol] || "").trim() : "";
    const qty = qtyCol >= 0 ? parseFloat(fields[qtyCol] || "0") : 0;
    const unitCost = unitCostCol >= 0 ? parseFloat((fields[unitCostCol] || "0").replace(/[^0-9.]/g, "")) : 0;
    const total = totalCol >= 0 ? parseFloat((fields[totalCol] || "0").replace(/[^0-9.]/g, "")) : qty * unitCost;
    const unit = unitCol >= 0 ? (fields[unitCol] || "pcs").trim() : "pcs";
    const arrival = arrivalCol >= 0 ? (fields[arrivalCol] || "").trim() : "";

    if (supplierCol >= 0 && !supplierName) supplierName = (fields[supplierCol] || "").trim();
    if (poNumberCol >= 0 && !poNumber) poNumber = (fields[poNumberCol] || "").trim();
    if (arrivalCol >= 0 && !expectedDate) expectedDate = arrival;
    if (notesCol >= 0 && !notes) notes = (fields[notesCol] || "").trim();

    // Skip shipping line items and empty rows
    if (sku.toUpperCase() === "NS-SHIPPING" || name.toLowerCase() === "shipping") {
      additionalCosts += total || unitCost;
      continue;
    }

    if (name && qty > 0) {
      lineItems.push({ sku, name, quantity: qty, unitCost, total, unit, expectedDate: arrival });
    }
  }

  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);

  return {
    poNumber,
    supplierName,
    expectedDate,
    notes,
    lineItems,
    additionalCosts,
    subtotal,
    total: subtotal + additionalCosts,
  };
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

export default function CSVImportPage() {
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedPO | null>(null);
  const [rawText, setRawText] = useState("");
  const [importing, setImporting] = useState(false);
  const [editSupplier, setEditSupplier] = useState("");
  const [editPONumber, setEditPONumber] = useState("");
  const [editExpectedDate, setEditExpectedDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [importResult, setImportResult] = useState<{ success: boolean; poNumber: string } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    setRawText(text);
    try {
      const result = parseKatanaCSV(text);
      setParsed(result);
      setEditSupplier(result.supplierName);
      setEditPONumber(result.poNumber);
      setEditExpectedDate(result.expectedDate);
      setEditNotes(result.notes);
      toast.success(`Parsed ${result.lineItems.length} line items`);
    } catch (err) {
      toast.error("Failed to parse CSV. Check the file format.");
      console.error(err);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".tsv") || file.type.includes("csv"))) {
      handleFile(file);
    } else {
      toast.error("Please drop a CSV file");
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    if (!parsed || parsed.lineItems.length === 0) return;
    setImporting(true);
    try {
      // Get or generate PO number
      const poNumber = editPONumber || await getNextPONumber();

      // Find or create supplier
      const supplierId = await findOrCreateSupplier(editSupplier || "Unknown");

      // Find or create products and build line items
      const lineItems: { product_id: string; quantity: number; unit_cost: number }[] = [];
      for (const item of parsed.lineItems) {
        const productId = await findOrCreateProduct(item.name, item.sku, item.unitCost);
        lineItems.push({
          product_id: productId,
          quantity: item.quantity,
          unit_cost: item.unitCost,
        });
      }

      // Create the PO
      await createPurchaseOrder(
        {
          po_number: poNumber,
          supplier_id: supplierId,
          status: "ordered",
          expected_date: editExpectedDate || null,
          notes: editNotes || "",
        },
        lineItems
      );

      setImportResult({ success: true, poNumber });
      toast.success(`PO ${poNumber} created with ${lineItems.length} items`);
    } catch (err: any) {
      toast.error(err.message || "Failed to import PO");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setParsed(null);
    setRawText("");
    setImportResult(null);
    setEditSupplier("");
    setEditPONumber("");
    setEditExpectedDate("");
    setEditNotes("");
  };

  return (
    <>
      <Header lowStockCount={0} />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-100">CSV Import</h1>
            <p className="text-[13px] text-gray-400 mt-1">Import purchase orders from Katana CSV exports</p>
          </div>
          {parsed && (
            <Button variant="secondary" onClick={reset}>← Start Over</Button>
          )}
        </div>

        {importResult ? (
          <div className="bg-surface-card border border-emerald-500/30 rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">✅</div>
            <div className="text-lg font-bold text-gray-100 mb-2">Import Successful</div>
            <div className="text-[13px] text-gray-400 mb-6">
              Purchase order <span className="font-mono text-brand">{importResult.poNumber}</span> has been created.
            </div>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={reset}>Import Another</Button>
              <Button onClick={() => window.location.href = "/purchase-orders"}>View Purchase Orders</Button>
            </div>
          </div>
        ) : !parsed ? (
          /* ─── DROP ZONE ─────────────────── */
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-16 text-center transition-all cursor-pointer ${
              dragOver
                ? "border-brand bg-brand/5"
                : "border-border hover:border-border-light"
            }`}
            onClick={() => document.getElementById("csv-file-input")?.click()}
          >
            <div className="text-4xl mb-4">📄</div>
            <div className="text-base font-semibold text-gray-100 mb-2">
              Drop your Katana CSV here
            </div>
            <div className="text-[13px] text-gray-400 mb-4">
              or click to browse files
            </div>
            <div className="text-[11px] text-gray-600">
              Supports Katana PO export format (.csv)
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
          <div className="space-y-6">
            {/* PO Header */}
            <div className="bg-surface-card border border-border rounded-xl p-6">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Purchase Order Details</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">PO Number</label>
                  <input
                    type="text"
                    value={editPONumber}
                    onChange={(e) => setEditPONumber(e.target.value)}
                    placeholder="Auto-generate"
                    className="w-full bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Supplier</label>
                  <input
                    type="text"
                    value={editSupplier}
                    onChange={(e) => setEditSupplier(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Expected Date</label>
                  <input
                    type="date"
                    value={editExpectedDate}
                    onChange={(e) => setEditExpectedDate(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="bg-surface-card border border-border rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Line Items ({parsed.lineItems.length})
                </div>
                <div className="text-[13px] text-gray-400">
                  Subtotal: <span className="font-bold text-gray-100">{formatCurrency(parsed.subtotal)}</span>
                  {parsed.additionalCosts > 0 && (
                    <span className="ml-3">
                      + Shipping: <span className="font-bold text-gray-100">{formatCurrency(parsed.additionalCosts)}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-border">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">SKU</th>
                      <th className="pb-2 pr-4">Item</th>
                      <th className="pb-2 pr-4 text-right">Qty</th>
                      <th className="pb-2 pr-4 text-right">Unit Cost</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.lineItems.map((item, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2.5 pr-4 text-gray-500">{i + 1}</td>
                        <td className="py-2.5 pr-4 font-mono text-[11px] text-gray-400">{item.sku || "—"}</td>
                        <td className="py-2.5 pr-4 text-gray-100">{item.name}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-100">{item.quantity} {item.unit}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-300">{formatCurrency(item.unitCost)}</td>
                        <td className="py-2.5 text-right font-semibold text-gray-100">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary + Import Button */}
            <div className="bg-surface-card border border-border rounded-xl p-6">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-[13px] text-gray-400">
                    {parsed.lineItems.length} items · Total: <span className="font-bold text-lg text-brand">{formatCurrency(parsed.total)}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    New products will be auto-created. Existing products matched by SKU or name.
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={reset}>Cancel</Button>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? "Importing..." : "Import Purchase Order"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
