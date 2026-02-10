"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  getPurchaseOrders, getProducts, getSuppliers, getNextPONumber,
  createPurchaseOrder, updatePOStatus, receivePurchaseOrder, deletePurchaseOrder,
} from "@/lib/data";
import { generatePOPdf } from "@/lib/generate-po-pdf";
import { Header } from "@/components/layout/Header";
import {
  Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner,
} from "@/components/ui";
import { formatCurrency, getPOStatusColor } from "@/lib/utils";
import type { Product, Supplier, PurchaseOrder } from "@/types/database";

export default function PurchaseOrdersPage() {
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);

  // Create form state
  const [nextNum, setNextNum] = useState("");
  const [form, setForm] = useState({ supplierId: "", expectedDate: "", notes: "" });
  const [lineItems, setLineItems] = useState<{ productId: string; qty: string; unitCost: string }[]>([]);

  const load = async () => {
    try {
      const [poData, prodData, supData] = await Promise.all([
        getPurchaseOrders(), getProducts(), getSuppliers(),
      ]);
      setPOs(poData);
      setProducts(prodData);
      setSuppliers(supData);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const lowStockCount = products.filter((p) => p.stock <= p.reorder_point).length;

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

  const lineTotal = lineItems.reduce(
    (s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitCost) || 0), 0
  );

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex justify-between mb-5">
          <div className="text-[13px] text-gray-400">{pos.length} purchase orders</div>
          <Button onClick={openCreate}>+ Create Purchase Order</Button>
        </div>

        {/* PO List */}
        <div className="flex flex-col gap-3">
          {pos.map((po) => {
            const total = po.line_items?.reduce((s, i) => s + i.quantity * i.unit_cost, 0) || 0;
            return (
              <div
                key={po.id}
                onClick={() => setViewPO(po)}
                className="bg-surface-card border border-border rounded-xl px-6 py-5 cursor-pointer hover:border-border-light hover:bg-surface-hover transition-all"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm text-gray-100 font-mono">{po.po_number}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {po.supplier?.name || "Unknown"} · {new Date(po.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-bold text-base text-gray-100">{formatCurrency(total)}</div>
                      <div className="text-[11px] text-gray-500">
                        {po.line_items?.length || 0} item{(po.line_items?.length || 0) !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <Badge color={getPOStatusColor(po.status) as any}>{po.status}</Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {pos.length === 0 && <EmptyState icon="📋" title="No purchase orders" sub="Create your first PO to get started" />}

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
                options={products.map((p) => ({ value: p.id, label: p.name }))}
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
              <Button variant="secondary" onClick={() => savePO("draft")}>Save as Draft</Button>
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
                    <div className="text-[13px] text-gray-400">{new Date(viewPO.created_at).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">EXPECTED</div>
                    <div className="text-[13px] text-gray-400">{viewPO.expected_date ? new Date(viewPO.expected_date).toLocaleDateString() : "—"}</div>
                  </div>
                </div>

                <div className="bg-[#0B0F19] rounded-xl p-4 mb-5">
                  {viewPO.line_items?.map((item, i) => (
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

                {viewPO.notes && <div className="text-xs text-gray-400 mb-4">Notes: {viewPO.notes}</div>}

                {/* Received info */}
                {viewPO.status === "received" && (
                  <div className="text-xs text-emerald-400 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    ✓ Received — items have been added to inventory
                  </div>
                )}

                <div className="flex justify-between">
                  <div className="flex gap-2">
                    {/* Export PDF - always visible */}
                    <Button variant="secondary" onClick={() => handleExportPdf(viewPO)}>
                      📄 Export PDF
                    </Button>

                    {/* Delete - visible for draft and ordered POs */}
                    {(viewPO.status === "draft" || viewPO.status === "ordered") && (
                      <Button variant="danger" onClick={() => handleDelete(viewPO.id)}>
                        🗑 Delete
                      </Button>
                    )}
                  </div>

                  <div className="flex gap-2.5">
                    {viewPO.status === "draft" && (
                      <Button variant="secondary" onClick={() => handleSubmitDraft(viewPO.id)}>Submit Order</Button>
                    )}
                    {viewPO.status === "ordered" && (
                      <Button onClick={() => handleReceive(viewPO.id)}>✓ Mark as Received</Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </Modal>
      </main>
    </>
  );
}
