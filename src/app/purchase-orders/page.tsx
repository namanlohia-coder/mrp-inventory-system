"use client";

import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  getPurchaseOrdersList, getPurchaseOrder, searchPurchaseOrders, getPurchaseOrdersTotal, getProducts, getSuppliers, getNextPONumber,
  createPurchaseOrder, updatePurchaseOrder, duplicatePurchaseOrder, updatePOStatus, receivePurchaseOrder, deletePurchaseOrder,
} from "@/lib/data";
import { generatePOPdf } from "@/lib/generate-po-pdf";
import { Header } from "@/components/layout/Header";
import {
  Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner,
} from "@/components/ui";
import { formatCurrency, getPOStatusColor } from "@/lib/utils";
import type { Product, Supplier, PurchaseOrder } from "@/types/database";

const PAGE_SIZE = 50;

// Fix timezone: date-only strings like "2026-02-10" are UTC, so format them in UTC
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

export default function PurchaseOrdersPage() {
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [dbTotal, setDbTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("ordered");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc">("date-desc");

  // Create form state
  const [nextNum, setNextNum] = useState("");
  const [form, setForm] = useState({ supplierId: "", expectedDate: "", notes: "" });
  const [lineItems, setLineItems] = useState<{ productId: string; qty: string; unitCost: string }[]>([]);

  // Edit modal state
  const [editModal, setEditModal] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [editForm, setEditForm] = useState({ supplierId: "", expectedDate: "", notes: "" });
  const [editLineItems, setEditLineItems] = useState<{ productId: string; qty: string; unitCost: string }[]>([]);

  const load = async (status?: string) => {
    const activeStatus = status || filterStatus;
    try {
      const [poResult, prodData, supData, totalAmt] = await Promise.all([
        getPurchaseOrdersList(PAGE_SIZE, 0, activeStatus),
        getProducts(),
        getSuppliers(),
        getPurchaseOrdersTotal(activeStatus),
      ]);
      setPOs(poResult.data);
      setTotalCount(poResult.count);
      setDbTotal(totalAmt);
      setProducts(prodData);
      setSuppliers(supData);
      setPage(0);
    } catch (e) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Reload when status tab changes
  const switchTab = (status: string) => {
    setFilterStatus(status);
    setPOs([]);
    setLoading(true);
    load(status);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getPurchaseOrdersList(PAGE_SIZE, nextPage * PAGE_SIZE, filterStatus);
      setPOs([...pos, ...result.data]);
      setPage(nextPage);
    } catch {
      toast.error("Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const lowStockCount = products.filter((p) => p.stock <= p.reorder_point).length;

  // Server-side search with debounce
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PurchaseOrder[] | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchPurchaseOrders(searchQuery.trim(), 100, filterStatus);
        setSearchResults(results);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, filterStatus]);

  // Get unique supplier names from loaded POs
  const poSupplierNames = useMemo(() => {
    const names = new Set<string>();
    pos.forEach((po) => {
      if (po.supplier?.name) names.add(po.supplier.name);
    });
    return Array.from(names).sort();
  }, [pos]);

  // Client-side filtering of loaded POs (or search results)
  const filtered = useMemo(() => {
    let result = searchResults !== null ? [...searchResults] : [...pos];

    if (filterSupplier !== "all") {
      result = result.filter((po) => po.supplier?.name === filterSupplier);
    }

    if (filterDateFrom) {
      result = result.filter((po) => po.created_at >= filterDateFrom);
    }
    if (filterDateTo) {
      result = result.filter((po) => po.created_at <= filterDateTo + "T23:59:59");
    }

    result.sort((a, b) => {
      const aAmount = (a as any).total_amount || 0;
      const bAmount = (b as any).total_amount || 0;
      // For open POs, sort by expected_date; for received, sort by received_date
      const aDate = filterStatus === "ordered"
        ? (a.expected_date || a.created_at)
        : ((a as any).received_date || a.created_at);
      const bDate = filterStatus === "ordered"
        ? (b.expected_date || b.created_at)
        : ((b as any).received_date || b.created_at);
      switch (sortBy) {
        case "date-desc": return new Date(bDate).getTime() - new Date(aDate).getTime();
        case "date-asc": return new Date(aDate).getTime() - new Date(bDate).getTime();
        case "amount-desc": return bAmount - aAmount;
        case "amount-asc": return aAmount - bAmount;
        default: return new Date(bDate).getTime() - new Date(aDate).getTime();
      }
    });
    return result;
  }, [pos, searchResults, filterSupplier, filterStatus, filterDateFrom, filterDateTo, sortBy]);

  const clearFilters = () => {
    setSearchQuery("");
    setFilterSupplier("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const hasActiveFilters = searchQuery || filterSupplier !== "all" || filterDateFrom || filterDateTo;
  const hasMore = pos.length < totalCount;

  // Calculate total dollar amount for filtered results
  const filteredTotal = useMemo(() => {
    return filtered.reduce((sum, po) => sum + ((po as any).total_amount || 0), 0);
  }, [filtered]);

  // View PO detail - loads full PO with line items
  const openViewPO = async (po: PurchaseOrder) => {
    setViewLoading(true);
    setViewPO(po); // Show modal immediately with header info
    try {
      const full = await getPurchaseOrder(po.id);
      setViewPO(full);
    } catch {
      toast.error("Failed to load PO details");
    } finally {
      setViewLoading(false);
    }
  };

  const openCreate = async () => {
    const num = await getNextPONumber();
    setNextNum(num);
    setForm({ supplierId: suppliers[0]?.id || "", expectedDate: "", notes: "" });
    setLineItems([{ productId: products[0]?.id || "", qty: "1", unitCost: String(products[0]?.cost || 0) }]);
    setCreateModal(true);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { productId: products[0]?.id || "", qty: "1", unitCost: "0" }]);
  };

  const updateLineItem = (idx: number, field: string, val: string) => {
    setLineItems(lineItems.map((item, i) => (i === idx ? { ...item, [field]: val } : item)));
  };

  const removeLineItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const savePO = async (status: "draft" | "ordered") => {
    if (!form.supplierId) return toast.error("Select a supplier");
    if (lineItems.length === 0) return toast.error("Add at least one line item");
    try {
      await createPurchaseOrder(
        { po_number: nextNum, supplier_id: form.supplierId, status, expected_date: form.expectedDate || null, notes: form.notes },
        lineItems.map((i) => ({ product_id: i.productId, quantity: parseInt(i.qty) || 0, unit_cost: parseFloat(i.unitCost) || 0 })),
      );
      toast.success(status === "draft" ? "Draft saved" : "Order submitted");
      setCreateModal(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to create PO");
    }
  };

  const handleReceive = async (poId: string) => {
    try {
      await receivePurchaseOrder(poId);
      toast.success("PO received — stock updated in Inventory");
      setViewPO(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to receive PO");
    }
  };

  const handleSubmitDraft = async (poId: string) => {
    try {
      await updatePOStatus(poId, "ordered");
      toast.success("Order submitted");
      setViewPO(null);
      load();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (poId: string) => {
    if (!confirm("Are you sure you want to delete this purchase order? This cannot be undone.")) return;
    try {
      await deletePurchaseOrder(poId);
      toast.success("Purchase order deleted");
      setViewPO(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete PO");
    }
  };

  const handleExportPdf = (po: PurchaseOrder) => {
    try {
      generatePOPdf(po);
      toast.success(`Exported ${po.po_number}.pdf`);
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    }
  };

  const openEditPO = (po: PurchaseOrder) => {
    setEditingPO(po);
    setEditForm({
      supplierId: po.supplier_id || "",
      expectedDate: po.expected_date || "",
      notes: po.notes || "",
    });
    setEditLineItems(
      (po.line_items || []).map((item) => ({
        productId: item.product_id,
        qty: String(item.quantity),
        unitCost: String(item.unit_cost),
      }))
    );
    setViewPO(null);
    setEditModal(true);
  };

  const addEditLineItem = () => {
    setEditLineItems([...editLineItems, { productId: products[0]?.id || "", qty: "1", unitCost: "0" }]);
  };

  const updateEditLineItem = (idx: number, field: string, val: string) => {
    setEditLineItems(editLineItems.map((item, i) => (i === idx ? { ...item, [field]: val } : item)));
  };

  const removeEditLineItem = (idx: number) => {
    setEditLineItems(editLineItems.filter((_, i) => i !== idx));
  };

  const saveEdit = async () => {
    if (!editingPO) return;
    if (!editForm.supplierId) return toast.error("Select a supplier");
    if (editLineItems.length === 0) return toast.error("Add at least one line item");
    try {
      const items = editLineItems.map((i) => ({
        product_id: i.productId,
        quantity: parseInt(i.qty) || 0,
        unit_cost: parseFloat(i.unitCost) || 0,
      }));
      const total = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
      await updatePurchaseOrder(
        editingPO.id,
        {
          supplier_id: editForm.supplierId,
          expected_date: editForm.expectedDate || null,
          notes: editForm.notes,
          total_amount: total,
        },
        items
      );
      toast.success("Purchase order updated");
      setEditModal(false);
      setEditingPO(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update PO");
    }
  };

  const handleDuplicate = async (po: PurchaseOrder) => {
    try {
      const newNum = await getNextPONumber();
      await duplicatePurchaseOrder(po.id, newNum);
      toast.success(`Duplicated as ${newNum}`);
      setViewPO(null);
      // Switch to Open tab since duplicated PO is "ordered"
      switchTab("ordered");
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate PO");
    }
  };

  const lineTotal = lineItems.reduce(
    (s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitCost) || 0), 0
  );

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        {/* ─── TOP BAR ──────────────────────── */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <div className="text-[13px] text-gray-400">
              {hasActiveFilters
                ? `${filtered.length} matching`
                : `${totalCount} purchase orders`
              }
              {filterStatus === "received" ? " · Received" : " · Open"}
            </div>
            <div className="text-[14px] font-bold text-brand">
              {formatCurrency(hasActiveFilters ? filteredTotal : dbTotal)}
            </div>
          </div>
          <Button onClick={openCreate}>+ Create Purchase Order</Button>
        </div>

        {/* ─── SEARCH + FILTER BAR ──────────── */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex gap-2.5 items-center">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Search all POs by number or supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-card border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs">✕</button>
              )}
            </div>

            {(["ordered", "received"] as const).map((s) => (
              <button
                key={s}
                onClick={() => switchTab(s)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                  filterStatus === s
                    ? "bg-brand/20 border-brand text-brand"
                    : "bg-surface-card border-border text-gray-400 hover:border-border-light"
                }`}
              >
                {s === "ordered" ? "Open" : "Received"}
              </button>
            ))}

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                showFilters
                  ? "bg-brand/20 border-brand text-brand"
                  : "bg-surface-card border-border text-gray-400 hover:border-border-light"
              }`}
            >
              ⚙ Filters
            </button>

            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-surface-card border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-gray-400 focus:outline-none focus:border-brand"
            >
              <option value="date-desc">Newest received</option>
              <option value="date-asc">Oldest received</option>
              <option value="amount-desc">Highest amount</option>
              <option value="amount-asc">Lowest amount</option>
            </select>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-[11px] text-red-400 hover:text-red-300 underline">
                Clear all
              </button>
            )}
          </div>

          {showFilters && (
            <div className="flex gap-3 items-end bg-surface-card border border-border rounded-xl px-4 py-3">
              <div className="flex-1">
                <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Supplier</label>
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
                >
                  <option value="all">All suppliers</option>
                  {poSupplierNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">From date</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">To date</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
                />
              </div>
            </div>
          )}
        </div>

        {/* ─── PO LIST ──────────────────────── */}
        <div className="flex flex-col gap-3">
          {filtered.map((po) => (
            <div
              key={po.id}
              onClick={() => openViewPO(po)}
              className="bg-surface-card border border-border rounded-xl px-6 py-5 cursor-pointer hover:border-border-light hover:bg-surface-hover transition-all"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold text-sm text-gray-100 font-mono">{po.po_number}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {po.supplier?.name || "Unknown"} · Created {fmtDate(po.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-bold text-base text-gray-100">{formatCurrency((po as any).total_amount || 0)}</div>
                    <div className="text-[11px] text-gray-500">
                      {po.status === "received"
                        ? `Received ${fmtDate((po as any).received_date)}`
                        : `Expected ${fmtDate(po.expected_date)}`
                      }
                    </div>
                  </div>
                  <Badge color={getPOStatusColor(po.status) as any}>{po.status}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Load More button */}
        {hasMore && !hasActiveFilters && (
          <div className="flex justify-center mt-6">
            <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading..." : `Load more (${pos.length} of ${totalCount})`}
            </Button>
          </div>
        )}

        {filtered.length === 0 && !hasActiveFilters && (
          <EmptyState
            icon={filterStatus === "ordered" ? "📦" : "📋"}
            title={filterStatus === "ordered" ? "No open purchase orders" : "No received purchase orders"}
            sub={filterStatus === "ordered" ? "Create a new PO to get started" : "No POs have been received yet"}
          />
        )}
        {filtered.length === 0 && hasActiveFilters && (
          <EmptyState icon="🔍" title="No matching POs" sub="Try adjusting your filters" />
        )}

        {/* ─── CREATE MODAL ──────────────────── */}
        <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Purchase Order" className="w-[680px]">
          <div className="text-xs text-gray-500 font-mono mb-5">{nextNum}</div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Select
              label="Supplier"
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Input label="Expected Delivery" type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
          </div>

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Line Items</div>
          {lineItems.map((item, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2.5 mb-2.5 items-end">
              <Select
                label={i === 0 ? "Product" : undefined}
                value={item.productId}
                onChange={(e) => {
                  const prod = products.find((p) => p.id === e.target.value);
                  updateLineItem(i, "productId", e.target.value);
                  if (prod) updateLineItem(i, "unitCost", String(prod.cost));
                }}
                options={products.map((p) => ({ value: p.id, label: `${p.sku ? `[${p.sku}] ` : ""}${p.name}` }))}
              />
              <Input label={i === 0 ? "Qty" : undefined} type="number" value={item.qty} onChange={(e) => updateLineItem(i, "qty", e.target.value)} />
              <Input label={i === 0 ? "Unit Cost" : undefined} type="number" value={item.unitCost} onChange={(e) => updateLineItem(i, "unitCost", e.target.value)} />
              <Button size="sm" variant="ghost" onClick={() => removeLineItem(i)}>✕</Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={addLineItem} className="mb-4">+ Add Line Item</Button>

          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <div className="flex justify-between items-center mt-6">
            <div className="font-bold text-base text-gray-100">Total: {formatCurrency(lineTotal)}</div>
            <div className="flex gap-2.5">
              <Button variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Button>
              <Button onClick={() => savePO("ordered")}>Submit Order</Button>
            </div>
          </div>
        </Modal>

        {/* ─── VIEW MODAL ────────────────────── */}
        <Modal open={!!viewPO} onClose={() => setViewPO(null)} title={`Purchase Order ${viewPO?.po_number || ""}`} className="w-[620px]">
          {viewPO && (() => {
            const total = viewPO.line_items?.reduce((s, i) => s + i.quantity * i.unit_cost, 0) || 0;
            return (
              <>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">SUPPLIER</div>
                    <div className="text-sm font-semibold text-gray-100">{viewPO.supplier?.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">STATUS</div>
                    <Badge color={getPOStatusColor(viewPO.status) as any}>{viewPO.status}</Badge>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">CREATED</div>
                    <div className="text-[13px] text-gray-400">{fmtDate(viewPO.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">EXPECTED</div>
                    <div className="text-[13px] text-gray-400">{fmtDate(viewPO.expected_date)}</div>
                  </div>
                </div>

                {viewLoading ? (
                  <div className="text-center py-8 text-gray-500 text-sm">Loading line items...</div>
                ) : viewPO.line_items && viewPO.line_items.length > 0 ? (
                  <div className="bg-[#0B0F19] rounded-xl p-4 mb-5 max-h-[300px] overflow-y-auto">
                    {viewPO.line_items.map((item, i) => (
                      <div key={item.id} className={`flex justify-between py-2.5 ${i < (viewPO.line_items?.length || 1) - 1 ? "border-b border-border" : ""}`}>
                        <div>
                          <div className="font-semibold text-[13px] text-gray-100">{item.product?.name || "Unknown"}</div>
                          <div className="text-[11px] text-gray-500">{item.product?.sku || ""} · {item.quantity} × {formatCurrency(item.unit_cost)}</div>
                        </div>
                        <div className="font-bold text-sm text-gray-100">{formatCurrency(item.quantity * item.unit_cost)}</div>
                      </div>
                    ))}
                    <div className="flex justify-between pt-3.5 border-t border-border-light mt-1.5">
                      <span className="font-bold text-sm text-gray-100">Total</span>
                      <span className="font-bold text-lg text-brand">{formatCurrency(total)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500 text-sm mb-5">No line items</div>
                )}

                {viewPO.notes && <div className="text-xs text-gray-400 mb-4">Notes: {viewPO.notes}</div>}

                {viewPO.status === "received" && (
                  <div className="text-xs text-emerald-400 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    ✓ Received — items have been added to inventory
                  </div>
                )}

                <div className="flex justify-between">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => handleExportPdf(viewPO)}>
                      📄 Export PDF
                    </Button>
                    <Button variant="secondary" onClick={() => handleDuplicate(viewPO)}>
                      📋 Duplicate
                    </Button>
                    {viewPO.status === "ordered" && (
                      <Button variant="secondary" onClick={() => openEditPO(viewPO)}>
                        ✏️ Edit
                      </Button>
                    )}
                    {viewPO.status === "ordered" && (
                      <Button variant="danger" onClick={() => handleDelete(viewPO.id)}>
                        🗑 Delete
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2.5">
                    {viewPO.status === "ordered" && (
                      <Button onClick={() => handleReceive(viewPO.id)}>✓ Mark as Received</Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </Modal>

        {/* ─── EDIT MODAL ──────────────────── */}
        <Modal open={editModal} onClose={() => { setEditModal(false); setEditingPO(null); }} title={`Edit ${editingPO?.po_number || ""}`} className="w-[680px]">
          {editingPO && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Select
                  label="Supplier"
                  value={editForm.supplierId}
                  onChange={(e) => setEditForm({ ...editForm, supplierId: e.target.value })}
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                />
                <Input label="Expected Delivery" type="date" value={editForm.expectedDate} onChange={(e) => setEditForm({ ...editForm, expectedDate: e.target.value })} />
              </div>

              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Line Items</div>
              {editLineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2.5 mb-2.5 items-end">
                  <Select
                    label={i === 0 ? "Product" : undefined}
                    value={item.productId}
                    onChange={(e) => {
                      const prod = products.find((p) => p.id === e.target.value);
                      updateEditLineItem(i, "productId", e.target.value);
                      if (prod) updateEditLineItem(i, "unitCost", String(prod.cost));
                    }}
                    options={products.map((p) => ({ value: p.id, label: `${p.sku ? `[${p.sku}] ` : ""}${p.name}` }))}
                  />
                  <Input label={i === 0 ? "Qty" : undefined} type="number" value={item.qty} onChange={(e) => updateEditLineItem(i, "qty", e.target.value)} />
                  <Input label={i === 0 ? "Unit Cost" : undefined} type="number" value={item.unitCost} onChange={(e) => updateEditLineItem(i, "unitCost", e.target.value)} />
                  <Button size="sm" variant="ghost" onClick={() => removeEditLineItem(i)}>✕</Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={addEditLineItem} className="mb-4">+ Add Line Item</Button>

              <Input label="Notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />

              <div className="flex justify-between items-center mt-6">
                <div className="font-bold text-base text-gray-100">
                  Total: {formatCurrency(editLineItems.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitCost) || 0), 0))}
                </div>
                <div className="flex gap-2.5">
                  <Button variant="secondary" onClick={() => { setEditModal(false); setEditingPO(null); }}>Cancel</Button>
                  <Button onClick={saveEdit}>Save Changes</Button>
                </div>
              </div>
            </>
          )}
        </Modal>
      </main>
    </>
  );
}
