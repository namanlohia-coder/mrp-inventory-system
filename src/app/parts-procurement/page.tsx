"use client";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  getProducts,
  getProductionParts,
  createProductionPart,
  updateProductionPart,
  deleteProductionPart,
  getProductionInvoices,
  createProductionInvoice,
  updateProductionInvoice,
  deleteProductionInvoice,
} from "@/lib/data";
import { Header } from "@/components/layout/Header";
import {
  Button,
  Badge,
  Modal,
  Input,
  Select,
  EmptyState,
  LoadingSpinner,
  Textarea,
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
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PartsProcurementPage() {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [parts, setParts] = useState<ProductionPart[]>([]);
  const [invoices, setInvoices] = useState<ProductionInvoice[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Invoice upload / parse flow ──────────────────────────────────────────────
  const [parseLoading, setParseLoading] = useState(false);
  const [parseConfirmModal, setParseConfirmModal] = useState(false);
  const [parsedFileName, setParsedFileName] = useState("");
  const [parsedPdfBase64, setParsedPdfBase64] = useState("");
  const [parsedLineItems, setParsedLineItems] = useState<ParsedLineItem[]>([]);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Invoice edit modal ────────────────────────────────────────────────────────
  const [editInvoiceModal, setEditInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<ProductionInvoice | null>(null);

  // ── Parts CRUD ────────────────────────────────────────────────────────────────
  const [addPartModal, setAddPartModal] = useState(false);
  const [editPartModal, setEditPartModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<ProductionPart | null>(null);
  const [partForm, setPartForm] = useState(emptyPartForm);

  // ── Filters ───────────────────────────────────────────────────────────────────
  const [partSearch, setPartSearch] = useState("");
  const [partFilter, setPartFilter] = useState<"all" | "outstanding" | "ordered" | "received">("all");

  // ── UI ────────────────────────────────────────────────────────────────────────
  const [invoicesExpanded, setInvoicesExpanded] = useState(true);

  // ─── Load data ──────────────────────────────────────────────────────────────

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

  useEffect(() => {
    const init = async () => {
      try {
        const [prods] = await Promise.all([getProducts()]);
        setProducts(prods);
        await Promise.all([loadParts(), loadInvoices(), loadOrders()]);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ─── Computed ───────────────────────────────────────────────────────────────

  const lowStockCount = products.filter((p: any) => p.stock <= p.reorder_point).length;

  const orderOptions = [
    { value: "", label: "No production order" },
    ...orders.map((o: any) => ({ value: o.id, label: o.order_name })),
  ];

  const productOptions = [
    { value: "", label: "— No linked product —" },
    ...products.map((p: any) => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ""}` })),
  ];

  const filteredParts = parts.filter((p) => {
    const matchSearch =
      !partSearch || p.part_name.toLowerCase().includes(partSearch.toLowerCase());
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

  // ─── Invoice upload + parse ──────────────────────────────────────────────────

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

  // ─── Save invoice + parts ────────────────────────────────────────────────────

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
        parsed_data: parsedLineItems.map(({ checked, ...li }) => li),
      });
      const checkedItems = parsedLineItems.filter((li) => li.checked);
      for (const li of checkedItems) {
        await createProductionPart({
          part_name: li.description,
          qty_needed: li.quantity || 1,
          production_order_id: invoiceForm.production_order_id || null,
          source_invoice_id: invoice?.id || null,
          notes: `From invoice ${invoiceForm.invoice_number || invoiceForm.vendor_name}`,
        });
      }
      const partsAdded = checkedItems.length;
      toast.success(
        `Invoice saved${partsAdded > 0 ? ` · ${partsAdded} part${partsAdded !== 1 ? "s" : ""} added to parts list` : ""}`
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

  // ─── Parts CRUD ──────────────────────────────────────────────────────────────

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
    if (!selectedPart || !partForm.part_name.trim()) return toast.error("Part name is required");
    try {
      await updateProductionPart(selectedPart.id, {
        part_name: partForm.part_name.trim(),
        product_id: partForm.product_id || null,
        qty_needed: parseFloat(partForm.qty_needed) || 1,
        production_order_id: partForm.production_order_id || null,
        po_number: partForm.po_number,
        notes: partForm.notes,
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
    setParts((prev) =>
      prev.map((p) => (p.id === part.id ? { ...p, [field]: newVal } : p))
    );
    try {
      await updateProductionPart(part.id, { [field]: newVal });
    } catch (err: any) {
      setParts((prev) =>
        prev.map((p) => (p.id === part.id ? { ...p, [field]: part[field] } : p))
      );
      toast.error(err.message || "Failed to update");
    }
  };

  // ─── Invoice CRUD ─────────────────────────────────────────────────────────────

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

  // ─── Helpers ──────────────────────────────────────────────────────────────────

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

  // ─── Sub-renders ──────────────────────────────────────────────────────────────

  const renderInvoiceForm = (
    form: typeof emptyInvoiceForm,
    setForm: React.Dispatch<React.SetStateAction<typeof emptyInvoiceForm>>
  ) => (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Input
          label="Vendor Name"
          value={form.vendor_name}
          onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
          placeholder="e.g. Acme Supply Co."
        />
      </div>
      <Input
        label="Invoice #"
        value={form.invoice_number}
        onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
        placeholder="INV-0001"
      />
      <Input
        label="Amount (USD)"
        type="number"
        value={form.amount}
        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        placeholder="0.00"
        min="0"
        step="0.01"
      />
      <Input
        label="Date"
        type="date"
        value={form.date}
        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
      />
      <Select
        label="Linked Production Order"
        options={orderOptions}
        value={form.production_order_id}
        onChange={(e) => setForm((f) => ({ ...f, production_order_id: e.target.value }))}
      />
      <div className="col-span-2">
        <Input
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Optional notes..."
        />
      </div>
    </div>
  );

  const renderPartForm = (
    form: typeof emptyPartForm,
    setForm: React.Dispatch<React.SetStateAction<typeof emptyPartForm>>
  ) => (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Input
          label="Part Name"
          value={form.part_name}
          onChange={(e) => setForm((f) => ({ ...f, part_name: e.target.value }))}
          placeholder="e.g. M6 Bolt × 50mm"
        />
      </div>
      <Input
        label="Qty Needed"
        type="number"
        value={form.qty_needed}
        onChange={(e) => setForm((f) => ({ ...f, qty_needed: e.target.value }))}
        min="0"
        step="1"
      />
      <Select
        label="Linked Production Order"
        options={orderOptions}
        value={form.production_order_id}
        onChange={(e) => setForm((f) => ({ ...f, production_order_id: e.target.value }))}
      />
      <Input
        label="PO #"
        value={form.po_number}
        onChange={(e) => setForm((f) => ({ ...f, po_number: e.target.value }))}
        placeholder="PO-XXXX"
      />
      <div />
      <div className="col-span-2">
        <Input
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Optional notes..."
        />
      </div>
    </div>
  );

  // ─── Loading ─────────────────────────────────────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────────

  const checkedCount = parsedLineItems.filter((li) => li.checked).length;
  const allChecked = parsedLineItems.length > 0 && parsedLineItems.every((li) => li.checked);

  return (
    <>
      <Header lowStockCount={lowStockCount} />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileUpload}
      />

      <main className="flex-1 overflow-auto p-8">

        {/* ═══ SECTION 1: INVOICES ═══════════════════════════════════════════════ */}
        <div className="mb-8">
          {/* Section header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setInvoicesExpanded((v) => !v)}
                className="text-gray-400 hover:text-gray-200 bg-transparent border-none cursor-pointer text-[13px] transition-colors"
              >
                {invoicesExpanded ? "▼" : "▶"}
              </button>
              <h2 className="text-[16px] font-bold text-gray-100">Invoices</h2>
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

          {/* Invoice table */}
          {invoicesExpanded && (
            <>
              {invoices.length === 0 ? (
                <EmptyState
                  icon="🧾"
                  title="No invoices yet"
                  sub="Upload a PDF invoice to get started. Claude will extract line items automatically."
                />
              ) : (
                <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Vendor
                        </th>
                        <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Invoice #
                        </th>
                        <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Amount
                        </th>
                        <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Date
                        </th>
                        <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Production Order
                        </th>
                        <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          File
                        </th>
                        <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Actions
                        </th>
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
                              {inv.amount ? formatCurrency(inv.amount) : <span className="text-gray-600">—</span>}
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
                                      amount: inv.amount != null ? String(inv.amount) : "",
                                      date: inv.date || "",
                                      production_order_id: inv.production_order_id || "",
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

        {/* Divider */}
        <div className="border-t border-border mb-8" />

        {/* ═══ SECTION 2: PARTS LIST ═════════════════════════════════════════════ */}
        <div>
          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Parts", value: totalParts, color: "text-gray-100" },
              { label: "Ordered", value: orderedParts, color: "text-amber-400" },
              { label: "Received", value: receivedParts, color: "text-emerald-400" },
              { label: "Outstanding", value: outstandingParts, color: outstandingParts > 0 ? "text-red-400" : "text-gray-100" },
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
            {/* Filter tabs */}
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

            {/* Search + Add */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
                  ⌕
                </span>
                <input
                  type="text"
                  value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                  placeholder="Search parts..."
                  className="bg-[#0B0F19] border border-border rounded-xl pl-8 pr-3.5 py-2 text-[13px] text-gray-200 outline-none focus:border-brand/50 transition-colors font-sans w-52"
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
                + Add Part
              </Button>
            </div>
          </div>

          {/* Section header */}
          <div className="flex items-center gap-3 pb-3 mb-0 border-b border-border">
            <h2 className="text-[16px] font-bold text-gray-100">Parts to Order</h2>
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
                  sub="Add parts manually or upload an invoice to auto-populate the list."
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
            <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden mt-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Part Name
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Qty
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Production Order
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Source Invoice
                    </th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Ordered?
                    </th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Received?
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      PO #
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Notes
                    </th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map((part) => {
                    const linkedProduct = part.product_id
                      ? products.find((p: any) => p.id === part.product_id)
                      : null;
                    const orderName = getOrderName(part.production_order_id);
                    const sourceLabel = getSourceInvoiceLabel(part.source_invoice_id);

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
                        {/* Part Name */}
                        <td className="px-4 py-3.5 text-[13px]">
                          <div className="font-medium text-gray-200">{part.part_name}</div>
                          {linkedProduct && (
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {linkedProduct.sku && (
                                <span className="mr-2 font-mono">{linkedProduct.sku}</span>
                              )}
                              <span
                                className={
                                  linkedProduct.stock <= linkedProduct.reorder_point
                                    ? "text-red-400"
                                    : "text-gray-500"
                                }
                              >
                                Stock: {linkedProduct.stock}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Qty */}
                        <td className="px-4 py-3.5 text-[13px] text-gray-300 font-semibold">
                          {part.qty_needed}
                        </td>

                        {/* Production Order */}
                        <td className="px-4 py-3.5 text-[13px]">
                          {orderName ? (
                            <Badge color="blue">{orderName}</Badge>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>

                        {/* Source Invoice */}
                        <td className="px-4 py-3.5 text-[13px]">
                          {sourceLabel ? (
                            <span className="text-[12px] text-gray-400">{sourceLabel}</span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>

                        {/* Ordered? */}
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={part.is_ordered}
                            onChange={() => handleTogglePart(part, "is_ordered")}
                            className="w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </td>

                        {/* Received? */}
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={part.is_received}
                            onChange={() => handleTogglePart(part, "is_received")}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer"
                          />
                        </td>

                        {/* PO # */}
                        <td className="px-4 py-3.5 text-[13px] text-gray-400 font-mono">
                          {part.po_number || <span className="text-gray-600 font-sans">—</span>}
                        </td>

                        {/* Notes */}
                        <td className="px-4 py-3.5 text-[13px] text-gray-500 max-w-[160px]">
                          <span className="line-clamp-2">{part.notes || "—"}</span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedPart(part);
                                setPartForm({
                                  part_name: part.part_name,
                                  product_id: part.product_id || "",
                                  qty_needed: String(part.qty_needed),
                                  production_order_id: part.production_order_id || "",
                                  po_number: part.po_number || "",
                                  notes: part.notes || "",
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
        className="w-[760px]"
      >
        <p className="text-[13px] text-gray-400 mb-6 -mt-2">
          Claude extracted the following from{" "}
          <span className="font-semibold text-gray-300">{parsedFileName}</span>. Review and
          add to parts list.
        </p>

        {/* Row 1: Vendor, Invoice#, Amount, Date */}
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
            onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_number: e.target.value }))}
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

        {/* Row 2: Production Order */}
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

        {/* Row 3: Notes */}
        <div className="mb-6">
          <Input
            label="Notes"
            value={invoiceForm.notes}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Optional notes..."
          />
        </div>

        {/* Line Items section */}
        {parsedLineItems.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold text-gray-300 mb-3">
              Line Items — check which to add to Parts List
            </div>
            <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
              <table className="w-full border-collapse">
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
                                i === idx ? { ...item, description: e.target.value } : item
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {parsedLineItems.length === 0 && (
          <div className="bg-surface-card border border-border rounded-[14px] px-5 py-6 text-center text-[13px] text-gray-500">
            No line items were extracted from this invoice.
          </div>
        )}

        {/* Footer */}
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
            Save Invoice{checkedCount > 0 ? ` & Add ${checkedCount} Part${checkedCount !== 1 ? "s" : ""}` : ""}
          </Button>
        </div>
      </Modal>

      {/* ═══ MODAL: Add Part ════════════════════════════════════════════════════ */}
      <Modal
        open={addPartModal}
        onClose={() => {
          setAddPartModal(false);
          setPartForm(emptyPartForm);
        }}
        title="Add Part"
      >
        {renderPartForm(partForm, setPartForm)}
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

      {/* ═══ MODAL: Edit Part ═══════════════════════════════════════════════════ */}
      <Modal
        open={editPartModal}
        onClose={() => {
          setEditPartModal(false);
          setSelectedPart(null);
          setPartForm(emptyPartForm);
        }}
        title="Edit Part"
      >
        {renderPartForm(partForm, setPartForm)}
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

      {/* ═══ MODAL: Edit Invoice ════════════════════════════════════════════════ */}
      <Modal
        open={editInvoiceModal}
        onClose={() => {
          setEditInvoiceModal(false);
          setSelectedInvoice(null);
          setInvoiceForm(emptyInvoiceForm);
        }}
        title="Edit Invoice"
      >
        {renderInvoiceForm(invoiceForm, setInvoiceForm)}
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
