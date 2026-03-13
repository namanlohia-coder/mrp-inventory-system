"use client";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  getProductionParts,
  createProductionPart,
  updateProductionPart,
  deleteProductionPart,
  getProductionInvoices,
  createProductionInvoice,
  updateProductionInvoice,
  deleteProductionInvoice,
  getSKUCatalog,
  replaceSKUCatalog,
} from "@/lib/data";
import type { SKUItem } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import {
  Button,
  Badge,
  Modal,
  Input,
  Select,
  EmptyState,
  LoadingSpinner,
} from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductionPart {
  id: string;
  part_name: string;
  product_id: string | null;
  qty_needed: number;
  production_order_id: string | null;
  is_ordered: boolean;
  is_received: boolean;
  po_number: string;
  notes: string;
  created_at: string;
  source_invoice_id?: string | null;
  sku_catalog_id?: string | null;
  order_link?: string | null;
  sku_catalog?: { sku: string; part_name: string; supplier: string; order_link: string } | null;
}

interface ProductionInvoice {
  id: string;
  vendor_name: string;
  invoice_number: string;
  amount: number;
  date: string | null;
  production_order_id: string | null;
  file_name: string;
  file_url: string;
  notes: string;
  parsed_data: any[];
  created_at: string;
}

interface ParsedLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  checked: boolean;
  matched_sku: SKUItem | null;
  manual_sku_id: string;
}

interface ColumnMapping {
  sku: string;
  part_name: string;
  price: string;
  supplier: string;
  order_link: string;
  category: string;
  qty_per_unit: string;
  set_cost: string;
  origin: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const emptyInvoiceForm = {
  vendor_name: "",
  invoice_number: "",
  amount: "",
  date: "",
  production_order_id: "",
  notes: "",
};

const emptyPartForm = {
  part_name: "",
  product_id: "",
  qty_needed: "1",
  production_order_id: "",
  po_number: "",
  notes: "",
  sku_catalog_id: "",
  order_link: "",
};

// ─── Fuzzy match helper ───────────────────────────────────────────────────────

function fuzzyMatchSKU(query: string, catalog: SKUItem[]): SKUItem | null {
  if (!query || !catalog.length) return null;
  const q = query.toLowerCase().trim();
  // 1. Exact part name match
  let m = catalog.find((item) => item.part_name.toLowerCase() === q);
  if (m) return m;
  // 2. Exact SKU match
  m = catalog.find((item) => item.sku && item.sku.toLowerCase() === q);
  if (m) return m;
  // 3. Name contains query or query contains name (at least 5 chars)
  if (q.length >= 5) {
    m = catalog.find((item) => {
      const name = item.part_name.toLowerCase();
      return name.includes(q) || q.includes(name);
    });
    if (m) return m;
  }
  // 4. SKU contains query
  m = catalog.find(
    (item) =>
      item.sku &&
      (item.sku.toLowerCase().includes(q) || q.includes(item.sku.toLowerCase()))
  );
  return m || null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PartsProcurementPage() {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [parts, setParts] = useState<ProductionPart[]>([]);
  const [invoices, setInvoices] = useState<ProductionInvoice[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [skuCatalog, setSKUCatalog] = useState<SKUItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ── SKU Catalog section ─────────────────────────────────────────────────────
  const [catalogExpanded, setCatalogExpanded] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [skuUploadLoading, setSKUUploadLoading] = useState(false);
  const skuFileInputRef = useRef<HTMLInputElement>(null);

  // Column mapping modal
  const [columnMappingModal, setColumnMappingModal] = useState(false);
  const [pendingHeaders, setPendingHeaders] = useState<string[]>([]);
  const [pendingRows, setPendingRows] = useState<any[][]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    sku: "",
    part_name: "",
    price: "",
    supplier: "",
    order_link: "",
    category: "",
    qty_per_unit: "",
    set_cost: "",
    origin: "",
  });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // ── Invoice upload / parse flow ──────────────────────────────────────────────
  const [parseLoading, setParseLoading] = useState(false);
  const [parseConfirmModal, setParseConfirmModal] = useState(false);
  const [parsedFileName, setParsedFileName] = useState("");
  const [parsedPdfBase64, setParsedPdfBase64] = useState("");
  const [parsedLineItems, setParsedLineItems] = useState<ParsedLineItem[]>([]);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Invoice edit ────────────────────────────────────────────────────────────
  const [editInvoiceModal, setEditInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<ProductionInvoice | null>(null);
  const [invoicesExpanded, setInvoicesExpanded] = useState(true);

  // ── Parts CRUD ────────────────────────────────────────────────────────────────
  const [addPartModal, setAddPartModal] = useState(false);
  const [editPartModal, setEditPartModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<ProductionPart | null>(null);
  const [partForm, setPartForm] = useState(emptyPartForm);

  // ── Filters ───────────────────────────────────────────────────────────────────
  const [partSearch, setPartSearch] = useState("");
  const [partFilter, setPartFilter] = useState<"all" | "outstanding" | "ordered" | "received">("all");

  // ─── Load data ───────────────────────────────────────────────────────────────

  const loadParts = async () => {
    try {
      setParts(await getProductionParts());
    } catch {
      toast.error("Failed to load parts");
    }
  };

  const loadInvoices = async () => {
    try {
      setInvoices(await getProductionInvoices());
    } catch {
      toast.error("Failed to load invoices");
    }
  };

  const loadOrders = async () => {
    const { data } = await supabase
      .from("production_orders")
      .select("id, order_name")
      .order("created_at", { ascending: false });
    setOrders(data || []);
  };

  const loadSKUCatalog = async () => {
    try {
      setSKUCatalog(await getSKUCatalog());
    } catch {
      // Table may not exist yet — silently ignore
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, sku, stock, reorder_point")
          .order("name");
        setProducts(prods || []);
        await Promise.all([loadParts(), loadInvoices(), loadOrders(), loadSKUCatalog()]);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ─── Computed ────────────────────────────────────────────────────────────────

  const lowStockCount = products.filter((p: any) => p.stock <= p.reorder_point).length;

  const orderOptions = [
    { value: "", label: "No production order" },
    ...orders.map((o: any) => ({ value: o.id, label: o.order_name })),
  ];

  const filteredCatalog = skuCatalog.filter(
    (item) =>
      !catalogSearch ||
      item.part_name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      item.sku.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      item.supplier.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      item.category.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      item.origin.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  // Group catalog by category (for ungrouped/no-search display)
  const catalogByCategory = skuCatalog.reduce<Record<string, SKUItem[]>>((acc, item) => {
    const cat = item.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const catalogCategories = Object.keys(catalogByCategory).sort();

  const filteredParts = parts.filter((p) => {
    const matchSearch =
      !partSearch ||
      p.part_name.toLowerCase().includes(partSearch.toLowerCase()) ||
      (p.sku_catalog?.sku || "").toLowerCase().includes(partSearch.toLowerCase());
    const matchFilter =
      partFilter === "all" ||
      (partFilter === "outstanding" && !p.is_received) ||
      (partFilter === "ordered" && p.is_ordered && !p.is_received) ||
      (partFilter === "received" && p.is_received);
    return matchSearch && matchFilter;
  });

  const totalParts = parts.length;
  const orderedParts = parts.filter((p) => p.is_ordered).length;
  const receivedParts = parts.filter((p) => p.is_received).length;
  const outstandingParts = parts.filter((p) => !p.is_received).length;

  // ─── SKU Sheet upload ─────────────────────────────────────────────────────────

  const handleSKUFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSKUUploadLoading(true);
    try {
      let headers: string[] = [];
      let rows: any[][] = [];

      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const result = Papa.parse(text, { header: false, skipEmptyLines: true });
        const data = result.data as any[][];
        if (data.length > 0) {
          headers = data[0].map(String);
          rows = data.slice(1);
        }
      } else if (
        file.name.toLowerCase().endsWith(".xlsx") ||
        file.name.toLowerCase().endsWith(".xls")
      ) {
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (data.length > 0) {
          headers = data[0].map(String);
          rows = data.slice(1);
        }
      } else {
        toast.error("Please upload a CSV or Excel (.xlsx) file");
        return;
      }

      if (!headers.length) {
        toast.error("No data found in file");
        return;
      }

      // Auto-detect column mappings by keyword
      const autoMap = (keywords: string[]): string =>
        headers.find((h) =>
          keywords.some((kw) => h.toLowerCase().includes(kw))
        ) || "";

      setPendingHeaders(headers);
      setPendingRows(rows.filter((r) => r.some((c) => String(c).trim())));
      setColumnMapping({
        sku: autoMap(["sku", "code", "part number", "part#", "item #", "item#"]),
        part_name: autoMap(["part name", "component", "name", "description", "item", "product"]),
        price: autoMap(["unit cost", "unit price", "price", "cost", "rate"]),
        supplier: autoMap(["supplier", "vendor", "manufacturer", "brand"]),
        order_link: autoMap(["order link", "link", "url", "buy link", "purchase link"]),
        category: autoMap(["subassembly", "category", "group", "section", "assembly"]),
        qty_per_unit: autoMap(["per drone", "qty per unit", "qty per", "per unit", "quantity per"]),
        set_cost: autoMap(["set cost", "total cost", "extended", "line total"]),
        origin: autoMap(["origin", "made in", "country", "source"]),
      });
      setColumnMappingModal(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse file");
    } finally {
      setSKUUploadLoading(false);
      if (skuFileInputRef.current) skuFileInputRef.current.value = "";
    }
  };

  const handleConfirmColumnMapping = async () => {
    if (!columnMapping.part_name) {
      toast.error("Part Name column is required");
      return;
    }
    setSKUUploadLoading(true);
    try {
      const idx = (col: string) => (col ? pendingHeaders.indexOf(col) : -1);
      const skuIdx = idx(columnMapping.sku);
      const nameIdx = idx(columnMapping.part_name);
      const priceIdx = idx(columnMapping.price);
      const supplierIdx = idx(columnMapping.supplier);
      const linkIdx = idx(columnMapping.order_link);
      const categoryIdx = idx(columnMapping.category);
      const qtyPerUnitIdx = idx(columnMapping.qty_per_unit);
      const setCostIdx = idx(columnMapping.set_cost);
      const originIdx = idx(columnMapping.origin);

      const items = pendingRows
        .filter((row) => nameIdx >= 0 && String(row[nameIdx] ?? "").trim())
        .map((row) => ({
          sku: skuIdx >= 0 ? String(row[skuIdx] ?? "").trim() : "",
          part_name: String(row[nameIdx] ?? "").trim(),
          price: priceIdx >= 0 ? parseFloat(String(row[priceIdx])) || null : null,
          supplier: supplierIdx >= 0 ? String(row[supplierIdx] ?? "").trim() : "",
          order_link: linkIdx >= 0 ? String(row[linkIdx] ?? "").trim() : "",
          category: categoryIdx >= 0 ? String(row[categoryIdx] ?? "").trim() : "",
          qty_per_unit: qtyPerUnitIdx >= 0 ? parseFloat(String(row[qtyPerUnitIdx])) || null : null,
          set_cost: setCostIdx >= 0 ? parseFloat(String(row[setCostIdx])) || null : null,
          origin: originIdx >= 0 ? String(row[originIdx] ?? "").trim() : "",
        }));

      await replaceSKUCatalog(items);
      toast.success(`SKU catalog updated — ${items.length} items loaded`);
      setColumnMappingModal(false);
      setPendingHeaders([]);
      setPendingRows([]);
      await loadSKUCatalog();
    } catch (err: any) {
      toast.error(err.message || "Failed to save catalog");
    } finally {
      setSKUUploadLoading(false);
    }
  };

  // ─── Invoice upload + parse ───────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return toast.error("Please upload a PDF file");
    setParseLoading(true);
    setParsedFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      const base64 = btoa(binary);
      setParsedPdfBase64(base64);
      const res = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64 }),
      });
      const parsed = await res.json();
      if (parsed.error) throw new Error(parsed.error);
      setInvoiceForm({
        vendor_name: parsed.vendor_name || "",
        invoice_number: parsed.invoice_number || "",
        amount: parsed.amount != null ? String(parsed.amount) : "",
        date: parsed.date || "",
        production_order_id: "",
        notes: "",
      });
      const lineItems = (parsed.line_items || parsed.parsed_data || []).map((li: any) => ({
        ...li,
        checked: true,
        matched_sku: fuzzyMatchSKU(li.description, skuCatalog),
        manual_sku_id: "",
      }));
      setParsedLineItems(lineItems);
      setParseConfirmModal(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse invoice");
    } finally {
      setParseLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Save invoice + parts ─────────────────────────────────────────────────────

  const handleSaveInvoice = async () => {
    if (!invoiceForm.vendor_name.trim()) return toast.error("Vendor name is required");
    try {
      const invoice = await createProductionInvoice({
        vendor_name: invoiceForm.vendor_name.trim(),
        invoice_number: invoiceForm.invoice_number,
        amount: parseFloat(invoiceForm.amount) || 0,
        date: invoiceForm.date || null,
        production_order_id: invoiceForm.production_order_id || null,
        file_name: parsedFileName,
        file_url: parsedPdfBase64,
        notes: invoiceForm.notes,
        parsed_data: parsedLineItems.map(
          ({ checked, matched_sku, manual_sku_id, ...li }) => li
        ),
      });
      const checkedItems = parsedLineItems.filter((li) => li.checked);
      for (const li of checkedItems) {
        const skuId = li.manual_sku_id || li.matched_sku?.id || null;
        const matchedItem = skuId ? skuCatalog.find((s) => s.id === skuId) : null;
        await createProductionPart({
          part_name: li.description,
          qty_needed: li.quantity || 1,
          production_order_id: invoiceForm.production_order_id || null,
          source_invoice_id: invoice?.id || null,
          sku_catalog_id: skuId,
          order_link: matchedItem?.order_link || "",
          notes: `From invoice ${invoiceForm.invoice_number || invoiceForm.vendor_name}`,
        });
      }
      const n = checkedItems.length;
      toast.success(
        `Invoice saved${n > 0 ? ` · ${n} part${n !== 1 ? "s" : ""} added to procurement list` : ""}`
      );
      setParseConfirmModal(false);
      setInvoiceForm(emptyInvoiceForm);
      setParsedPdfBase64("");
      setParsedFileName("");
      setParsedLineItems([]);
      await Promise.all([loadInvoices(), loadParts()]);
    } catch (err: any) {
      toast.error(err.message || "Failed to save invoice");
    }
  };

  // ─── Parts CRUD ───────────────────────────────────────────────────────────────

  const handleAddPart = async () => {
    if (!partForm.part_name.trim()) return toast.error("Part name is required");
    try {
      await createProductionPart({
        part_name: partForm.part_name.trim(),
        product_id: partForm.product_id || null,
        qty_needed: parseFloat(partForm.qty_needed) || 1,
        production_order_id: partForm.production_order_id || null,
        po_number: partForm.po_number,
        notes: partForm.notes,
        sku_catalog_id: partForm.sku_catalog_id || null,
        order_link: partForm.order_link || "",
      });
      toast.success("Part added");
      setAddPartModal(false);
      setPartForm(emptyPartForm);
      loadParts();
    } catch (err: any) {
      toast.error(err.message || "Failed to add part");
    }
  };

  const handleEditPart = async () => {
    if (!selectedPart || !partForm.part_name.trim())
      return toast.error("Part name is required");
    try {
      await updateProductionPart(selectedPart.id, {
        part_name: partForm.part_name.trim(),
        product_id: partForm.product_id || null,
        qty_needed: parseFloat(partForm.qty_needed) || 1,
        production_order_id: partForm.production_order_id || null,
        po_number: partForm.po_number,
        notes: partForm.notes,
        sku_catalog_id: partForm.sku_catalog_id || null,
        order_link: partForm.order_link || "",
      });
      toast.success("Part updated");
      setEditPartModal(false);
      setSelectedPart(null);
      loadParts();
    } catch (err: any) {
      toast.error(err.message || "Failed to update part");
    }
  };

  const handleDeletePart = async (part: ProductionPart) => {
    if (!confirm(`Delete part "${part.part_name}"?`)) return;
    try {
      await deleteProductionPart(part.id);
      toast.success("Part deleted");
      loadParts();
    } catch {
      toast.error("Failed to delete part");
    }
  };

  const handleTogglePart = async (
    part: ProductionPart,
    field: "is_ordered" | "is_received"
  ) => {
    const newVal = !part[field];
    setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, [field]: newVal } : p)));
    try {
      await updateProductionPart(part.id, { [field]: newVal });
    } catch (err: any) {
      setParts((prev) =>
        prev.map((p) => (p.id === part.id ? { ...p, [field]: part[field] } : p))
      );
      toast.error(err.message || "Failed to update");
    }
  };

  // ─── Invoice CRUD ──────────────────────────────────────────────────────────────

  const handleEditInvoice = async () => {
    if (!selectedInvoice || !invoiceForm.vendor_name.trim())
      return toast.error("Vendor name is required");
    try {
      await updateProductionInvoice(selectedInvoice.id, {
        vendor_name: invoiceForm.vendor_name.trim(),
        invoice_number: invoiceForm.invoice_number,
        amount: parseFloat(invoiceForm.amount) || 0,
        date: invoiceForm.date || null,
        production_order_id: invoiceForm.production_order_id || null,
        notes: invoiceForm.notes,
      });
      toast.success("Invoice updated");
      setEditInvoiceModal(false);
      setSelectedInvoice(null);
      loadInvoices();
    } catch (err: any) {
      toast.error(err.message || "Failed to update invoice");
    }
  };

  const handleDeleteInvoice = async (inv: ProductionInvoice) => {
    if (!confirm(`Delete invoice from "${inv.vendor_name}"?`)) return;
    try {
      await deleteProductionInvoice(inv.id);
      toast.success("Invoice deleted");
      loadInvoices();
    } catch {
      toast.error("Failed to delete invoice");
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────────

  const getOrderName = (orderId: string | null) => {
    if (!orderId) return null;
    return orders.find((o) => o.id === orderId)?.order_name || null;
  };

  const getSourceInvoiceLabel = (invoiceId: string | null | undefined) => {
    if (!invoiceId) return null;
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return null;
    return inv.vendor_name + (inv.invoice_number ? ` · ${inv.invoice_number}` : "");
  };

  const handlePartCatalogSelect = (skuId: string) => {
    const item = skuCatalog.find((s) => s.id === skuId);
    if (item) {
      setPartForm((f) => ({
        ...f,
        sku_catalog_id: skuId,
        part_name: f.part_name || item.part_name,
        order_link: item.order_link || "",
      }));
    } else {
      setPartForm((f) => ({ ...f, sku_catalog_id: "", order_link: "" }));
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Header lowStockCount={0} />
        <main className="flex-1 overflow-auto p-8">
          <LoadingSpinner />
        </main>
      </>
    );
  }

  // ─── Computed for render ───────────────────────────────────────────────────────

  const checkedCount = parsedLineItems.filter((li) => li.checked).length;
  const allChecked =
    parsedLineItems.length > 0 && parsedLineItems.every((li) => li.checked);

  const catalogSelectOptions = [
    { value: "", label: "— Select from catalog —" },
    ...skuCatalog.map((s) => ({
      value: s.id,
      label: `${s.part_name}${s.sku ? ` (${s.sku})` : ""}${s.supplier ? ` · ${s.supplier}` : ""}`,
    })),
  ];

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Header lowStockCount={lowStockCount} />

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={skuFileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleSKUFileSelect}
      />

      <main className="flex-1 overflow-auto p-8 space-y-8">

        {/* ═══ SECTION 1: SKU CATALOG ════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCatalogExpanded((v) => !v)}
                className="text-gray-400 hover:text-gray-200 bg-transparent border-none cursor-pointer text-[13px] transition-colors"
              >
                {catalogExpanded ? "▼" : "▶"}
              </button>
              <h2 className="text-[16px] font-bold text-gray-100">SKU Catalog</h2>
              <span className="text-[12px] text-gray-500 bg-surface-card border border-border px-2 py-0.5 rounded-full">
                {skuCatalog.length} item{skuCatalog.length !== 1 ? "s" : ""} in catalog
              </span>
            </div>
            <div className="flex items-center gap-3">
              {skuUploadLoading && (
                <div className="flex items-center gap-2 text-[13px] text-gray-400">
                  <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                  Processing...
                </div>
              )}
              <Button
                variant={skuCatalog.length > 0 ? "secondary" : "primary"}
                size="sm"
                onClick={() => skuFileInputRef.current?.click()}
                disabled={skuUploadLoading}
              >
                {skuCatalog.length > 0 ? "Re-upload SKU Sheet" : "Upload SKU Sheet"}
              </Button>
            </div>
          </div>

          {catalogExpanded && (
            <>
              {skuCatalog.length === 0 ? (
                <EmptyState
                  icon="📋"
                  title="No SKU catalog yet"
                  sub="Upload a CSV or Excel file with your parts catalog. You'll map which columns to SKU, Part Name, Price, Supplier, Order Link, Category, Qty/Unit, Set Cost, and Origin."
                />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
                        ⌕
                      </span>
                      <input
                        type="text"
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        placeholder="Search catalog..."
                        className="bg-[#0B0F19] border border-border rounded-xl pl-8 pr-3.5 py-2 text-[13px] text-gray-200 outline-none focus:border-brand/50 transition-colors font-sans w-56"
                      />
                    </div>
                    {catalogSearch && (
                      <span className="text-[12px] text-gray-500">
                        {filteredCatalog.length} of {skuCatalog.length}
                      </span>
                    )}
                  </div>

                  {/* Shared table header columns */}
                  {(() => {
                    const thCls = "px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";
                    const cols = ["Component", "Part #", "Supplier", "URL", "Per Drone", "Unit Cost", "Set Cost", "Origin"];

                    const renderRow = (item: SKUItem) => (
                      <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                        <td className="px-4 py-2.5 text-[13px] text-gray-200 font-medium">{item.part_name}</td>
                        <td className="px-4 py-2.5 text-[12px] font-mono text-gray-400">{item.sku || <span className="text-gray-600">—</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-gray-400">{item.supplier || <span className="text-gray-600">—</span>}</td>
                        <td className="px-4 py-2.5">
                          {item.order_link ? (
                            <a href={item.order_link} target="_blank" rel="noopener noreferrer" className="text-[12px] text-brand hover:underline whitespace-nowrap">
                              Order →
                            </a>
                          ) : (
                            <span className="text-gray-600 text-[12px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-gray-300 text-right">
                          {item.qty_per_unit != null ? item.qty_per_unit : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-gray-300 text-right">
                          {item.price != null ? formatCurrency(item.price) : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-gray-300 text-right">
                          {item.set_cost != null ? formatCurrency(item.set_cost) : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-gray-500">{item.origin || <span className="text-gray-600">—</span>}</td>
                      </tr>
                    );

                    if (catalogSearch) {
                      // Flat filtered list
                      return (
                        <div className="bg-surface-card border border-border rounded-[14px] overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b border-border">
                                {cols.map((col) => <th key={col} className={thCls}>{col}</th>)}
                              </tr>
                            </thead>
                            <tbody>{filteredCatalog.map(renderRow)}</tbody>
                          </table>
                        </div>
                      );
                    }

                    // Grouped by category
                    return (
                      <div className="space-y-3">
                        {catalogCategories.map((cat) => {
                          const isCollapsed = collapsedCategories.has(cat);
                          const items = catalogByCategory[cat];
                          return (
                            <div key={cat} className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
                              {/* Category header */}
                              <button
                                onClick={() =>
                                  setCollapsedCategories((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(cat)) next.delete(cat);
                                    else next.add(cat);
                                    return next;
                                  })
                                }
                                className="w-full flex items-center justify-between px-4 py-3 bg-surface-hover/30 hover:bg-surface-hover/60 transition-colors cursor-pointer border-none text-left"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-gray-500 text-[11px]">{isCollapsed ? "▶" : "▼"}</span>
                                  <span className="text-[13px] font-semibold text-gray-200">{cat}</span>
                                  <span className="text-[11px] text-gray-500 bg-surface-card border border-border px-2 py-0.5 rounded-full">
                                    {items.length}
                                  </span>
                                </div>
                              </button>
                              {!isCollapsed && (
                                <div className="overflow-x-auto">
                                  <table className="w-full border-collapse">
                                    <thead>
                                      <tr className="border-b border-border border-t border-border">
                                        {cols.map((col) => <th key={col} className={thCls}>{col}</th>)}
                                      </tr>
                                    </thead>
                                    <tbody>{items.map(renderRow)}</tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </div>

        {/* ═══ SECTION 2: UPLOAD INVOICE ═════════════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setInvoicesExpanded((v) => !v)}
                className="text-gray-400 hover:text-gray-200 bg-transparent border-none cursor-pointer text-[13px] transition-colors"
              >
                {invoicesExpanded ? "▼" : "▶"}
              </button>
              <h2 className="text-[16px] font-bold text-gray-100">Upload Invoice</h2>
              {invoices.length > 0 && (
                <span className="text-[12px] text-gray-500 bg-surface-card border border-border px-2 py-0.5 rounded-full">
                  {invoices.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {parseLoading && (
                <div className="flex items-center gap-2 text-[13px] text-gray-400">
                  <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                  Parsing PDF...
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={parseLoading}
              >
                + Upload Invoice
              </Button>
            </div>
          </div>

          {invoicesExpanded && (
            <>
              {invoices.length === 0 ? (
                <EmptyState
                  icon="🧾"
                  title="No invoices yet"
                  sub="Upload a PDF invoice to get started. Claude will extract vendor, amount, date, and line items automatically."
                />
              ) : (
                <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        {[
                          "Vendor",
                          "Invoice #",
                          "Amount",
                          "Date",
                          "Production Order",
                          "File",
                          "Actions",
                        ].map((col, i) => (
                          <th
                            key={col}
                            className={`px-4 py-3.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide ${
                              i === 6 ? "text-right" : "text-left"
                            }`}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const orderName = getOrderName(inv.production_order_id);
                        const lineCount = Array.isArray(inv.parsed_data)
                          ? inv.parsed_data.length
                          : 0;
                        return (
                          <tr
                            key={inv.id}
                            className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
                          >
                            <td className="px-4 py-3.5 text-[13px]">
                              <div className="font-medium text-gray-200">{inv.vendor_name}</div>
                              {inv.notes && (
                                <div className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[180px]">
                                  {inv.notes}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-[13px] text-gray-300">
                              {inv.invoice_number || <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-[13px] text-gray-200 font-semibold">
                              {inv.amount ? (
                                formatCurrency(inv.amount)
                              ) : (
                                <span className="text-gray-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-[13px] text-gray-400">
                              {inv.date || <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-[13px]">
                              {orderName ? (
                                <Badge color="blue">{orderName}</Badge>
                              ) : (
                                <span className="text-gray-600 text-[13px]">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-[13px]">
                              {inv.file_name ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-500">📄</span>
                                  <span className="text-[12px] text-gray-400 truncate max-w-[140px]">
                                    {inv.file_name}
                                  </span>
                                  {lineCount > 0 && (
                                    <span className="text-[11px] text-gray-600">
                                      · {lineCount} line{lineCount !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedInvoice(inv);
                                    setInvoiceForm({
                                      vendor_name: inv.vendor_name,
                                      invoice_number: inv.invoice_number || "",
                                      amount:
                                        inv.amount != null ? String(inv.amount) : "",
                                      date: inv.date || "",
                                      production_order_id:
                                        inv.production_order_id || "",
                                      notes: inv.notes || "",
                                    });
                                    setEditInvoiceModal(true);
                                  }}
                                  className="text-[12px] text-gray-400 hover:text-gray-200 bg-transparent border border-border hover:border-border-light rounded-lg px-3 py-1.5 transition-colors cursor-pointer font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteInvoice(inv)}
                                  className="text-[12px] text-red-400 hover:text-red-300 bg-transparent border border-red-500/20 hover:border-red-500/40 rounded-lg px-3 py-1.5 transition-colors cursor-pointer font-medium"
                                >
                                  Del
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ SECTION 3: PROCUREMENT LIST ═══════════════════════════════════════ */}
        <div>
          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Parts", value: totalParts, color: "text-gray-100" },
              { label: "Ordered", value: orderedParts, color: "text-amber-400" },
              { label: "Received", value: receivedParts, color: "text-emerald-400" },
              {
                label: "Outstanding",
                value: outstandingParts,
                color: outstandingParts > 0 ? "text-red-400" : "text-gray-100",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-surface-card border border-border rounded-[14px] px-5 py-4"
              >
                <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium mb-1">
                  {stat.label}
                </div>
                <div className={`text-[24px] font-bold ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              {(["all", "outstanding", "ordered", "received"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setPartFilter(f)}
                  className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold border transition-all cursor-pointer capitalize ${
                    partFilter === f
                      ? "bg-brand/20 border-brand text-brand"
                      : "bg-surface-card border-border text-gray-400 hover:border-border-light"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
                  ⌕
                </span>
                <input
                  type="text"
                  value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                  placeholder="Search parts or SKU..."
                  className="bg-[#0B0F19] border border-border rounded-xl pl-8 pr-3.5 py-2 text-[13px] text-gray-200 outline-none focus:border-brand/50 transition-colors font-sans w-56"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setPartForm(emptyPartForm);
                  setAddPartModal(true);
                }}
              >
                + Add Part Manually
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <h2 className="text-[16px] font-bold text-gray-100">Procurement List</h2>
            {filteredParts.length !== parts.length && (
              <span className="text-[12px] text-gray-500">
                {filteredParts.length} of {parts.length}
              </span>
            )}
          </div>

          {/* Parts table */}
          {filteredParts.length === 0 ? (
            <div className="mt-4">
              {parts.length === 0 ? (
                <EmptyState
                  icon="🔩"
                  title="No parts yet"
                  sub="Add parts manually or upload an invoice to auto-populate the procurement list."
                />
              ) : (
                <EmptyState
                  icon="🔍"
                  title="No matching parts"
                  sub="Try a different search term or filter."
                />
              )}
            </div>
          ) : (
            <div className="bg-surface-card border border-border rounded-[14px] overflow-x-auto mt-0">
              <table className="w-full border-collapse min-w-[1200px]">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      "Part Name",
                      "SKU",
                      "Qty",
                      "Supplier",
                      "Order Link",
                      "Production Order",
                      "Source",
                      "Ordered?",
                      "Received?",
                      "PO #",
                      "Notes",
                      "",
                    ].map((col, i) => (
                      <th
                        key={i}
                        className={`px-4 py-3.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${
                          col === "Ordered?" || col === "Received?"
                            ? "text-center"
                            : i === 11
                            ? "text-right"
                            : "text-left"
                        }`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map((part) => {
                    const orderName = getOrderName(part.production_order_id);
                    const sourceLabel = getSourceInvoiceLabel(part.source_invoice_id);
                    const sku = part.sku_catalog?.sku || "";
                    const supplier = part.sku_catalog?.supplier || "";
                    const orderLink =
                      part.order_link || part.sku_catalog?.order_link || "";
                    const rowBg = part.is_received
                      ? "bg-emerald-500/5"
                      : part.is_ordered
                      ? "bg-amber-500/5"
                      : "";

                    return (
                      <tr
                        key={part.id}
                        className={`border-b border-border last:border-0 hover:bg-surface-hover transition-colors ${rowBg}`}
                      >
                        <td className="px-4 py-3.5 text-[13px] font-medium text-gray-200">
                          {part.part_name}
                        </td>
                        <td className="px-4 py-3.5 text-[12px] font-mono text-gray-400">
                          {sku || <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-300 font-semibold">
                          {part.qty_needed}
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-400">
                          {supplier || <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          {orderLink ? (
                            <a
                              href={orderLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[12px] bg-brand/10 border border-brand/30 text-brand rounded-lg px-2.5 py-1 hover:bg-brand/20 transition-colors whitespace-nowrap"
                            >
                              Order →
                            </a>
                          ) : (
                            <span className="text-gray-600 text-[12px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[13px]">
                          {orderName ? (
                            <Badge color="blue">{orderName}</Badge>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[12px] text-gray-400">
                          {sourceLabel || <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={part.is_ordered}
                            onChange={() => handleTogglePart(part, "is_ordered")}
                            className="w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={part.is_received}
                            onChange={() => handleTogglePart(part, "is_received")}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-400 font-mono">
                          {part.po_number || (
                            <span className="text-gray-600 font-sans">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-500 max-w-[130px]">
                          <span className="line-clamp-2">{part.notes || "—"}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedPart(part);
                                setPartForm({
                                  part_name: part.part_name,
                                  product_id: part.product_id || "",
                                  qty_needed: String(part.qty_needed),
                                  production_order_id:
                                    part.production_order_id || "",
                                  po_number: part.po_number || "",
                                  notes: part.notes || "",
                                  sku_catalog_id: part.sku_catalog_id || "",
                                  order_link: part.order_link || "",
                                });
                                setEditPartModal(true);
                              }}
                              className="text-[12px] text-gray-400 hover:text-gray-200 bg-transparent border border-border hover:border-border-light rounded-lg px-3 py-1.5 transition-colors cursor-pointer font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeletePart(part)}
                              className="text-[12px] text-red-400 hover:text-red-300 bg-transparent border border-red-500/20 hover:border-red-500/40 rounded-lg px-3 py-1.5 transition-colors cursor-pointer font-medium"
                            >
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ═══ MODAL: Column Mapping (SKU Sheet) ══════════════════════════════════ */}
      <Modal
        open={columnMappingModal}
        onClose={() => {
          setColumnMappingModal(false);
          setPendingHeaders([]);
          setPendingRows([]);
        }}
        title="Map SKU Sheet Columns"
        className="w-[640px]"
      >
        <p className="text-[13px] text-gray-400 mb-5 -mt-2">
          {pendingRows.length} rows detected. Map each required field to the correct column
          in your file.
        </p>

        <div className="space-y-3 mb-6">
          {(
            [
              { key: "part_name" as const, label: "Component / Part Name", required: true },
              { key: "sku" as const, label: "SKU / Part #", required: false },
              { key: "category" as const, label: "Category / Subassembly", required: false },
              { key: "supplier" as const, label: "Supplier", required: false },
              { key: "order_link" as const, label: "Order Link / URL", required: false },
              { key: "qty_per_unit" as const, label: "Qty Per Drone / Unit", required: false },
              { key: "price" as const, label: "Unit Cost / Price", required: false },
              { key: "set_cost" as const, label: "Set Cost", required: false },
              { key: "origin" as const, label: "Origin / Country", required: false },
            ] as { key: keyof ColumnMapping; label: string; required: boolean }[]
          ).map(({ key, label, required }) => (
            <div key={key} className="flex items-center gap-4">
              <div className="text-[13px] text-gray-300 font-medium w-40 shrink-0">
                {label}{" "}
                {required && <span className="text-red-400">*</span>}
              </div>
              <select
                value={columnMapping[key]}
                onChange={(e) =>
                  setColumnMapping((m) => ({ ...m, [key]: e.target.value }))
                }
                className="flex-1 bg-[#0B0F19] border border-border rounded-lg px-3 py-2 text-[13px] text-gray-200 outline-none focus:border-brand/50 transition-colors font-sans"
              >
                <option value="">— Not in file —</option>
                {pendingHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Preview table */}
        {pendingRows.length > 0 && (
          <div>
            <div className="text-[12px] text-gray-500 mb-2">Preview (first 3 rows):</div>
            <div className="bg-surface-card border border-border rounded-[10px] overflow-hidden overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-surface-hover/40">
                    {pendingHeaders.map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {pendingHeaders.map((_, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-2 text-gray-400 whitespace-nowrap max-w-[150px] truncate"
                        >
                          {String(row[ci] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border">
          <Button
            variant="secondary"
            onClick={() => {
              setColumnMappingModal(false);
              setPendingHeaders([]);
              setPendingRows([]);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmColumnMapping}
            disabled={skuUploadLoading}
          >
            {skuUploadLoading
              ? "Saving..."
              : `Import ${pendingRows.length} Item${pendingRows.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </Modal>

      {/* ═══ MODAL: Parse Confirmation ══════════════════════════════════════════ */}
      <Modal
        open={parseConfirmModal}
        onClose={() => {
          setParseConfirmModal(false);
          setInvoiceForm(emptyInvoiceForm);
          setParsedPdfBase64("");
          setParsedFileName("");
          setParsedLineItems([]);
        }}
        title="Confirm Invoice & Add Parts"
        className="w-[880px]"
      >
        <p className="text-[13px] text-gray-400 mb-6 -mt-2">
          Claude extracted the following from{" "}
          <span className="font-semibold text-gray-300">{parsedFileName}</span>. Review and
          add to procurement list.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input
            label="Vendor Name"
            value={invoiceForm.vendor_name}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, vendor_name: e.target.value }))}
            placeholder="Vendor name"
          />
          <Input
            label="Invoice #"
            value={invoiceForm.invoice_number}
            onChange={(e) =>
              setInvoiceForm((f) => ({ ...f, invoice_number: e.target.value }))
            }
            placeholder="INV-0001"
          />
          <Input
            label="Amount (USD)"
            type="number"
            value={invoiceForm.amount}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
            min="0"
            step="0.01"
          />
          <Input
            label="Date"
            type="date"
            value={invoiceForm.date}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>
        <div className="mb-4">
          <Select
            label="Linked Production Order"
            options={orderOptions}
            value={invoiceForm.production_order_id}
            onChange={(e) =>
              setInvoiceForm((f) => ({ ...f, production_order_id: e.target.value }))
            }
          />
        </div>
        <div className="mb-6">
          <Input
            label="Notes"
            value={invoiceForm.notes}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Optional notes..."
          />
        </div>

        {/* Line Items */}
        {parsedLineItems.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-semibold text-gray-300">
                Line Items — check which to add to Procurement List
              </div>
              {skuCatalog.length > 0 && (
                <div className="text-[11px] text-gray-500">
                  {parsedLineItems.filter((li) => li.matched_sku || li.manual_sku_id).length}{" "}
                  of {parsedLineItems.length} matched to catalog
                </div>
              )}
            </div>
            <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden overflow-x-auto">
              <table className="w-full border-collapse min-w-[620px]">
                <thead>
                  <tr className="border-b border-border bg-surface-hover/40">
                    <th className="px-3 py-2.5 text-left w-8">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) =>
                          setParsedLineItems((items) =>
                            items.map((li) => ({ ...li, checked: e.target.checked }))
                          )
                        }
                        className="w-4 h-4 accent-brand cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Description
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-16">
                      Qty
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">
                      Unit Price
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">
                      Total
                    </th>
                    {skuCatalog.length > 0 && (
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-52">
                        Catalog Match
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {parsedLineItems.map((li, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-border last:border-0 transition-colors ${
                        li.checked ? "" : "opacity-40"
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={li.checked}
                          onChange={(e) =>
                            setParsedLineItems((items) =>
                              items.map((item, i) =>
                                i === idx ? { ...item, checked: e.target.checked } : item
                              )
                            )
                          }
                          className="w-4 h-4 accent-brand cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={li.description}
                          onChange={(e) =>
                            setParsedLineItems((items) =>
                              items.map((item, i) =>
                                i === idx
                                  ? { ...item, description: e.target.value }
                                  : item
                              )
                            )
                          }
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-brand/50 rounded-md px-2 py-1 text-[13px] text-gray-200 outline-none transition-colors font-sans"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] text-gray-300">
                        {li.quantity ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] text-gray-400">
                        {li.unit_price != null ? formatCurrency(li.unit_price) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] text-gray-300 font-semibold">
                        {li.total != null ? formatCurrency(li.total) : "—"}
                      </td>
                      {skuCatalog.length > 0 && (
                        <td className="px-3 py-2.5">
                          {li.matched_sku && !li.manual_sku_id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 font-mono whitespace-nowrap">
                                {li.matched_sku.sku || li.matched_sku.part_name}
                              </span>
                              <button
                                onClick={() =>
                                  setParsedLineItems((items) =>
                                    items.map((item, i) =>
                                      i === idx
                                        ? { ...item, matched_sku: null, manual_sku_id: "" }
                                        : item
                                    )
                                  )
                                }
                                className="text-[10px] text-gray-600 hover:text-gray-400 bg-transparent border-none cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <select
                              value={li.manual_sku_id || ""}
                              onChange={(e) => {
                                const skuItem =
                                  skuCatalog.find((s) => s.id === e.target.value) || null;
                                setParsedLineItems((items) =>
                                  items.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          manual_sku_id: e.target.value,
                                          matched_sku: skuItem,
                                        }
                                      : item
                                  )
                                );
                              }}
                              className="w-full bg-[#0B0F19] border border-border rounded-lg px-2 py-1.5 text-[12px] text-gray-300 outline-none focus:border-brand/50 transition-colors font-sans"
                            >
                              <option value="">No match</option>
                              {skuCatalog.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.part_name}
                                  {s.sku ? ` (${s.sku})` : ""}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-surface-card border border-border rounded-[14px] px-5 py-6 text-center text-[13px] text-gray-500">
            No line items were extracted from this invoice.
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border">
          <Button
            variant="secondary"
            onClick={() => {
              setParseConfirmModal(false);
              setInvoiceForm(emptyInvoiceForm);
              setParsedPdfBase64("");
              setParsedFileName("");
              setParsedLineItems([]);
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveInvoice}>
            Save Invoice
            {checkedCount > 0
              ? ` & Add ${checkedCount} Part${checkedCount !== 1 ? "s" : ""}`
              : ""}
          </Button>
        </div>
      </Modal>

      {/* ═══ MODAL: Add Part Manually ════════════════════════════════════════════ */}
      <Modal
        open={addPartModal}
        onClose={() => {
          setAddPartModal(false);
          setPartForm(emptyPartForm);
        }}
        title="Add Part Manually"
      >
        <div className="space-y-4">
          {skuCatalog.length > 0 && (
            <Select
              label="Select from Catalog (optional)"
              options={catalogSelectOptions}
              value={partForm.sku_catalog_id}
              onChange={(e) => handlePartCatalogSelect(e.target.value)}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input
                label="Part Name"
                value={partForm.part_name}
                onChange={(e) => setPartForm((f) => ({ ...f, part_name: e.target.value }))}
                placeholder="e.g. M6 Bolt × 50mm"
              />
            </div>
            <Input
              label="Qty Needed"
              type="number"
              value={partForm.qty_needed}
              onChange={(e) => setPartForm((f) => ({ ...f, qty_needed: e.target.value }))}
              min="0"
              step="1"
            />
            <Select
              label="Linked Production Order"
              options={orderOptions}
              value={partForm.production_order_id}
              onChange={(e) =>
                setPartForm((f) => ({ ...f, production_order_id: e.target.value }))
              }
            />
            <Input
              label="PO #"
              value={partForm.po_number}
              onChange={(e) => setPartForm((f) => ({ ...f, po_number: e.target.value }))}
              placeholder="PO-XXXX"
            />
            <Input
              label="Order Link (URL)"
              value={partForm.order_link}
              onChange={(e) => setPartForm((f) => ({ ...f, order_link: e.target.value }))}
              placeholder="https://..."
            />
            <div className="col-span-2">
              <Input
                label="Notes"
                value={partForm.notes}
                onChange={(e) => setPartForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..."
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border">
          <Button
            variant="secondary"
            onClick={() => {
              setAddPartModal(false);
              setPartForm(emptyPartForm);
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAddPart}>
            Add Part
          </Button>
        </div>
      </Modal>

      {/* ═══ MODAL: Edit Part ════════════════════════════════════════════════════ */}
      <Modal
        open={editPartModal}
        onClose={() => {
          setEditPartModal(false);
          setSelectedPart(null);
          setPartForm(emptyPartForm);
        }}
        title="Edit Part"
      >
        <div className="space-y-4">
          {skuCatalog.length > 0 && (
            <Select
              label="Catalog Item (optional)"
              options={catalogSelectOptions}
              value={partForm.sku_catalog_id}
              onChange={(e) => handlePartCatalogSelect(e.target.value)}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input
                label="Part Name"
                value={partForm.part_name}
                onChange={(e) => setPartForm((f) => ({ ...f, part_name: e.target.value }))}
                placeholder="Part name"
              />
            </div>
            <Input
              label="Qty Needed"
              type="number"
              value={partForm.qty_needed}
              onChange={(e) => setPartForm((f) => ({ ...f, qty_needed: e.target.value }))}
              min="0"
              step="1"
            />
            <Select
              label="Linked Production Order"
              options={orderOptions}
              value={partForm.production_order_id}
              onChange={(e) =>
                setPartForm((f) => ({ ...f, production_order_id: e.target.value }))
              }
            />
            <Input
              label="PO #"
              value={partForm.po_number}
              onChange={(e) => setPartForm((f) => ({ ...f, po_number: e.target.value }))}
              placeholder="PO-XXXX"
            />
            <Input
              label="Order Link (URL)"
              value={partForm.order_link}
              onChange={(e) => setPartForm((f) => ({ ...f, order_link: e.target.value }))}
              placeholder="https://..."
            />
            <div className="col-span-2">
              <Input
                label="Notes"
                value={partForm.notes}
                onChange={(e) => setPartForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..."
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border">
          <Button
            variant="secondary"
            onClick={() => {
              setEditPartModal(false);
              setSelectedPart(null);
              setPartForm(emptyPartForm);
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEditPart}>
            Save Changes
          </Button>
        </div>
      </Modal>

      {/* ═══ MODAL: Edit Invoice ═════════════════════════════════════════════════ */}
      <Modal
        open={editInvoiceModal}
        onClose={() => {
          setEditInvoiceModal(false);
          setSelectedInvoice(null);
          setInvoiceForm(emptyInvoiceForm);
        }}
        title="Edit Invoice"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input
              label="Vendor Name"
              value={invoiceForm.vendor_name}
              onChange={(e) =>
                setInvoiceForm((f) => ({ ...f, vendor_name: e.target.value }))
              }
              placeholder="e.g. Acme Supply Co."
            />
          </div>
          <Input
            label="Invoice #"
            value={invoiceForm.invoice_number}
            onChange={(e) =>
              setInvoiceForm((f) => ({ ...f, invoice_number: e.target.value }))
            }
            placeholder="INV-0001"
          />
          <Input
            label="Amount (USD)"
            type="number"
            value={invoiceForm.amount}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
            min="0"
            step="0.01"
          />
          <Input
            label="Date"
            type="date"
            value={invoiceForm.date}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, date: e.target.value }))}
          />
          <Select
            label="Linked Production Order"
            options={orderOptions}
            value={invoiceForm.production_order_id}
            onChange={(e) =>
              setInvoiceForm((f) => ({ ...f, production_order_id: e.target.value }))
            }
          />
          <div className="col-span-2">
            <Input
              label="Notes"
              value={invoiceForm.notes}
              onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border">
          <Button
            variant="secondary"
            onClick={() => {
              setEditInvoiceModal(false);
              setSelectedInvoice(null);
              setInvoiceForm(emptyInvoiceForm);
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEditInvoice}>
            Save Changes
          </Button>
        </div>
      </Modal>
    </>
  );
}
