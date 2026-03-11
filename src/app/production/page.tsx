"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { getProducts, getCustomers } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner, Textarea } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductionOrder {
  id: string;
  order_name: string;
  description: string;
  customer_id: string | null;
  quantity: number;
  start_date: string | null;
  training_date: string | null;
  delivery_date: string | null;
  status: OrderStatus;
  notes: string;
  created_at: string;
  customers?: { id: string; name: string } | null;
  production_order_materials?: MaterialLine[];
}

interface MaterialLine {
  id: string;
  production_order_id: string;
  product_id: string;
  quantity_needed: number;
  products?: { id: string; name: string; sku: string; stock: number };
}

type OrderStatus = "Planning" | "In Training" | "In Production" | "Ready" | "Delivered";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "Planning", label: "Planning" },
  { value: "In Training", label: "In Training" },
  { value: "In Production", label: "In Production" },
  { value: "Ready", label: "Ready" },
  { value: "Delivered", label: "Delivered" },
];

const STATUS_FILTER = [{ value: "all", label: "All Statuses" }, ...STATUS_OPTIONS];

function statusColor(s: OrderStatus): "default" | "blue" | "orange" | "green" | "red" {
  if (s === "Planning") return "default";
  if (s === "In Training") return "blue";
  if (s === "In Production") return "orange";
  if (s === "Ready") return "green";
  if (s === "Delivered") return "red";
  return "default";
}

const emptyForm = {
  order_name: "",
  description: "",
  customer_id: "",
  quantity: "1",
  start_date: "",
  training_date: "",
  delivery_date: "",
  status: "Planning" as OrderStatus,
  notes: "",
};

type ActiveTab = "schedule" | "parts" | "invoices";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("schedule");
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [materialsModal, setMaterialsModal] = useState(false);
  const [autoPOModal, setAutoPOModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);

  // Form
  const [form, setForm] = useState(emptyForm);

  // Materials form (for the selected order)
  const [materials, setMaterials] = useState<MaterialLine[]>([]);
  const [newMatProductId, setNewMatProductId] = useState("");
  const [newMatQty, setNewMatQty] = useState("1");
  const [matSaving, setMatSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from("production_orders")
      .select(`
        *,
        customers(id, name),
        production_order_materials(
          id, production_order_id, product_id, quantity_needed,
          products(id, name, sku, stock)
        )
      `)
      .order("created_at", { ascending: false });
    if (error) { toast.error("Failed to load production orders"); return; }
    setOrders((data as ProductionOrder[]) || []);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [prods, custs] = await Promise.all([getProducts(), getCustomers()]);
        setProducts(prods);
        setCustomers(custs);
        await loadOrders();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const lowStockCount = products.filter((p: any) => p.stock <= p.reorder_point).length;

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!form.order_name.trim()) return toast.error("Order name is required");
    try {
      const { error } = await supabase.from("production_orders").insert({
        order_name: form.order_name.trim(),
        description: form.description,
        customer_id: form.customer_id || null,
        quantity: parseInt(form.quantity) || 1,
        start_date: form.start_date || null,
        training_date: form.training_date || null,
        delivery_date: form.delivery_date || null,
        status: form.status,
        notes: form.notes,
      });
      if (error) throw error;
      toast.success("Production order created");
      setAddModal(false);
      setForm(emptyForm);
      loadOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    }
  };

  const openEdit = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setForm({
      order_name: order.order_name,
      description: order.description || "",
      customer_id: order.customer_id || "",
      quantity: String(order.quantity),
      start_date: order.start_date || "",
      training_date: order.training_date || "",
      delivery_date: order.delivery_date || "",
      status: order.status,
      notes: order.notes || "",
    });
    setEditModal(true);
  };

  const handleEdit = async () => {
    if (!selectedOrder) return;
    if (!form.order_name.trim()) return toast.error("Order name is required");
    try {
      const { error } = await supabase
        .from("production_orders")
        .update({
          order_name: form.order_name.trim(),
          description: form.description,
          customer_id: form.customer_id || null,
          quantity: parseInt(form.quantity) || 1,
          start_date: form.start_date || null,
          training_date: form.training_date || null,
          delivery_date: form.delivery_date || null,
          status: form.status,
          notes: form.notes,
        })
        .eq("id", selectedOrder.id);
      if (error) throw error;
      toast.success("Order updated");
      setEditModal(false);
      setSelectedOrder(null);
      loadOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    }
  };

  const handleDelete = async (order: ProductionOrder) => {
    if (!confirm(`Delete production order "${order.order_name}"?`)) return;
    try {
      const { error } = await supabase.from("production_orders").delete().eq("id", order.id);
      if (error) throw error;
      toast.success("Order deleted");
      loadOrders();
    } catch {
      toast.error("Failed to delete order");
    }
  };

  // ── Materials ─────────────────────────────────────────────────────────────

  const openMaterials = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setMaterials(order.production_order_materials || []);
    setNewMatProductId("");
    setNewMatQty("1");
    setMaterialsModal(true);
  };

  const handleAddMaterial = async () => {
    if (!selectedOrder || !newMatProductId) return toast.error("Select a product");
    const qty = parseFloat(newMatQty);
    if (!qty || qty <= 0) return toast.error("Enter a valid quantity");
    if (materials.some((m) => m.product_id === newMatProductId)) {
      return toast.error("Product already added to this order");
    }
    setMatSaving(true);
    try {
      const { data, error } = await supabase
        .from("production_order_materials")
        .insert({ production_order_id: selectedOrder.id, product_id: newMatProductId, quantity_needed: qty })
        .select("id, production_order_id, product_id, quantity_needed, products(id, name, sku, stock)")
        .single();
      if (error) throw error;
      setMaterials((prev) => [...prev, data as MaterialLine]);
      setNewMatProductId("");
      setNewMatQty("1");
      loadOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to add material");
    } finally {
      setMatSaving(false);
    }
  };

  const handleRemoveMaterial = async (matId: string) => {
    try {
      const { error } = await supabase.from("production_order_materials").delete().eq("id", matId);
      if (error) throw error;
      setMaterials((prev) => prev.filter((m) => m.id !== matId));
      loadOrders();
    } catch {
      toast.error("Failed to remove material");
    }
  };

  // ── Auto-Generate PO ──────────────────────────────────────────────────────

  // Aggregate shortages across all active (non-Delivered) orders
  const shortages = (() => {
    const map = new Map<string, { product: any; needed: number; stock: number }>();
    for (const order of orders) {
      if (order.status === "Delivered") continue;
      for (const mat of order.production_order_materials || []) {
        const prod = mat.products;
        if (!prod) continue;
        const needed = mat.quantity_needed * order.quantity;
        const existing = map.get(prod.id);
        if (existing) {
          existing.needed += needed;
        } else {
          map.set(prod.id, { product: prod, needed, stock: prod.stock });
        }
      }
    }
    return Array.from(map.values()).filter((s) => s.needed > s.stock);
  })();

  // ── Filtered table ────────────────────────────────────────────────────────

  const filtered = orders.filter((o) => {
    const matchSearch =
      !search ||
      o.order_name.toLowerCase().includes(search.toLowerCase()) ||
      (o.customers?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.notes || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "—";

  const customerOptions = [
    { value: "", label: "No customer" },
    ...customers.map((c: any) => ({ value: c.id, label: c.name })),
  ];

  const productOptions = [
    { value: "", label: "Select product..." },
    ...products.map((p: any) => ({ value: p.id, label: `${p.name} (${p.sku}) — stock: ${p.stock}` })),
  ];

  const renderOrderForm = () => (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Input label="Order Name" value={form.order_name} onChange={(e) => setForm({ ...form, order_name: e.target.value })} placeholder="e.g. Batch #42 – Widget Assembly" />
      </div>
      <div className="col-span-2">
        <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description..." />
      </div>
      <Select label="Customer" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} options={customerOptions} />
      <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
      <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
      <Input label="Training Date" type="date" value={form.training_date} onChange={(e) => setForm({ ...form, training_date: e.target.value })} />
      <Input label="Delivery Date" type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
      <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as OrderStatus })} options={STATUS_OPTIONS} />
      <div className="col-span-2">
        <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." />
      </div>
    </div>
  );

  if (loading) return <LoadingSpinner />;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">

        {/* Tabs */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-2">
            {(["schedule", "parts", "invoices"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all cursor-pointer ${
                  activeTab === t
                    ? "bg-brand/20 border-brand text-brand"
                    : "bg-surface-card border-border text-gray-400 hover:border-border-light"
                }`}
              >
                {t === "schedule" ? "Production Schedule" : t === "parts" ? "Parts to Order" : "Invoices"}
              </button>
            ))}
          </div>
        </div>

        {/* Parts to Order placeholder */}
        {activeTab === "parts" && (
          <div className="flex items-center justify-center py-24 text-gray-500 text-[15px]">
            Parts to Order — coming soon
          </div>
        )}

        {/* Invoices placeholder */}
        {activeTab === "invoices" && (
          <div className="flex items-center justify-center py-24 text-gray-500 text-[15px]">
            Invoices — coming soon
          </div>
        )}

        {/* Schedule tab content */}
        {activeTab === "schedule" && <>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Total Orders</div>
              <div className="text-[18px] font-bold text-gray-100">{orders.length}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Active</div>
              <div className="text-[18px] font-bold text-blue-400">
                {orders.filter((o) => o.status !== "Delivered").length}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Material Shortages</div>
              <div className={`text-[18px] font-bold ${shortages.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {shortages.length}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {shortages.length > 0 && (
              <Button variant="secondary" onClick={() => setAutoPOModal(true)}>
                ⚠ Auto-Generate PO ({shortages.length})
              </Button>
            )}
            <Button onClick={() => { setForm(emptyForm); setAddModal(true); }}>+ New Production Order</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 flex gap-3 items-center">
          <input
            type="text"
            placeholder="Search by order name, customer, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#0B0F19] border border-border rounded-lg px-3 py-2 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
          >
            {STATUS_FILTER.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-[12px] text-gray-500">{filtered.length} order{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        {filtered.length > 0 ? (
          <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Order</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                  <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Start</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Training</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Delivery</th>
                  <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Materials</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const mats = order.production_order_materials || [];
                  const hasShortage = mats.some(
                    (m) => (m.products?.stock ?? 0) < m.quantity_needed * order.quantity
                  );
                  return (
                    <tr key={order.id} className="border-b border-border hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="text-[13px] text-gray-100 font-medium">{order.order_name}</div>
                        {order.description && (
                          <div className="text-[11px] text-gray-500 mt-0.5 max-w-[200px] truncate">{order.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-300">{order.customers?.name || "—"}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-100 font-mono text-center">{order.quantity}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-400 whitespace-nowrap">{fmtDate(order.start_date)}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-400 whitespace-nowrap">{fmtDate(order.training_date)}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-400 whitespace-nowrap">{fmtDate(order.delivery_date)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <Badge color={statusColor(order.status)}>{order.status}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => openMaterials(order)}
                          className={`text-[12px] font-medium px-2.5 py-1 rounded-md border cursor-pointer transition-colors bg-transparent ${
                            hasShortage
                              ? "text-red-400 border-red-500/30 hover:bg-red-500/10"
                              : mats.length > 0
                              ? "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                              : "text-gray-500 border-border hover:bg-surface-hover"
                          }`}
                        >
                          {mats.length > 0
                            ? `${mats.length} item${mats.length !== 1 ? "s" : ""}${hasShortage ? " ⚠" : " ✓"}`
                            : "+ Add"}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(order)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(order)} className="!text-red-400">Del</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="⚙" title="No production orders" sub="Create your first production order to get started" />
        )}

        {/* ── Add Modal ─────────────────────────────────────────────────────── */}
        <Modal open={addModal} onClose={() => setAddModal(false)} title="New Production Order" className="w-[640px]">
          {renderOrderForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Create Order</Button>
          </div>
        </Modal>

        {/* ── Edit Modal ────────────────────────────────────────────────────── */}
        <Modal open={editModal} onClose={() => { setEditModal(false); setSelectedOrder(null); }} title="Edit Production Order" className="w-[640px]">
          {renderOrderForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => { setEditModal(false); setSelectedOrder(null); }}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </div>
        </Modal>

        {/* ── Materials Modal ───────────────────────────────────────────────── */}
        <Modal
          open={materialsModal}
          onClose={() => { setMaterialsModal(false); setSelectedOrder(null); }}
          title={`Required Materials — ${selectedOrder?.order_name || ""}`}
          className="w-[680px]"
        >
          {selectedOrder && (
            <>
              <p className="text-[12px] text-gray-500 mb-4">
                Quantities below are per-unit. With order qty of <span className="text-gray-300 font-semibold">{selectedOrder.quantity}</span>, total needed is shown in parentheses.
              </p>

              {/* Existing materials */}
              {materials.length > 0 ? (
                <div className="bg-[#0B0F19] border border-border rounded-xl overflow-hidden mb-4">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2.5 text-left text-[11px] text-gray-500 uppercase tracking-wide">Product</th>
                        <th className="px-3 py-2.5 text-center text-[11px] text-gray-500 uppercase tracking-wide">Per Unit</th>
                        <th className="px-3 py-2.5 text-center text-[11px] text-gray-500 uppercase tracking-wide">Total Needed</th>
                        <th className="px-3 py-2.5 text-center text-[11px] text-gray-500 uppercase tracking-wide">In Stock</th>
                        <th className="px-3 py-2.5 text-center text-[11px] text-gray-500 uppercase tracking-wide">Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((mat) => {
                        const prod = mat.products;
                        const totalNeeded = mat.quantity_needed * selectedOrder.quantity;
                        const stock = prod?.stock ?? 0;
                        const shortage = totalNeeded > stock;
                        return (
                          <tr key={mat.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2.5">
                              <div className="text-[13px] text-gray-200 font-medium">{prod?.name || "Unknown"}</div>
                              <div className="text-[11px] text-gray-500 font-mono">{prod?.sku}</div>
                            </td>
                            <td className="px-3 py-2.5 text-center text-[13px] text-gray-300">{mat.quantity_needed}</td>
                            <td className="px-3 py-2.5 text-center text-[13px] text-gray-300">{totalNeeded}</td>
                            <td className="px-3 py-2.5 text-center text-[13px] font-semibold" style={{ color: shortage ? "#f87171" : "#34d399" }}>
                              {stock}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {shortage ? (
                                <Badge color="red">Short {totalNeeded - stock}</Badge>
                              ) : (
                                <Badge color="green">OK</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                onClick={() => handleRemoveMaterial(mat.id)}
                                className="text-[12px] text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500 text-[13px] mb-4">No materials added yet.</div>
              )}

              {/* Add material row */}
              <div className="bg-[#0B0F19] border border-border rounded-xl p-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold mb-3">Add Material</div>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Select
                      label="Product"
                      value={newMatProductId}
                      onChange={(e) => setNewMatProductId(e.target.value)}
                      options={productOptions.filter(
                        (o) => !o.value || !materials.some((m) => m.product_id === o.value)
                      )}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      label="Qty / unit"
                      type="number"
                      min="0.001"
                      step="any"
                      value={newMatQty}
                      onChange={(e) => setNewMatQty(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleAddMaterial} disabled={matSaving || !newMatProductId}>
                    {matSaving ? "Adding..." : "+ Add"}
                  </Button>
                </div>
              </div>

              <div className="flex justify-end mt-5">
                <Button variant="secondary" onClick={() => { setMaterialsModal(false); setSelectedOrder(null); }}>Close</Button>
              </div>
            </>
          )}
        </Modal>

        {/* ── Auto-Generate PO Modal ────────────────────────────────────────── */}
        <Modal
          open={autoPOModal}
          onClose={() => setAutoPOModal(false)}
          title="Auto-Generate Purchase Order — Material Shortages"
          className="w-[680px]"
        >
          <p className="text-[13px] text-gray-400 mb-5">
            The following materials are short across all active production orders. Use this as a reference to create a Purchase Order.
          </p>

          {shortages.length > 0 ? (
            <div className="bg-[#0B0F19] border border-border rounded-xl overflow-hidden mb-5">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[11px] text-gray-500 uppercase tracking-wide">Product</th>
                    <th className="px-4 py-3 text-center text-[11px] text-gray-500 uppercase tracking-wide">In Stock</th>
                    <th className="px-4 py-3 text-center text-[11px] text-gray-500 uppercase tracking-wide">Total Needed</th>
                    <th className="px-4 py-3 text-center text-[11px] text-gray-500 uppercase tracking-wide">Order Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {shortages.map(({ product, needed, stock }) => (
                    <tr key={product.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="text-[13px] text-gray-200 font-medium">{product.name}</div>
                        <div className="text-[11px] text-gray-500 font-mono">{product.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-red-400 font-semibold">{stock}</td>
                      <td className="px-4 py-3 text-center text-[13px] text-gray-300">{needed}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[13px] font-bold text-amber-400">{needed - stock}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-emerald-400 text-[13px] mb-5">No shortages — all materials are sufficiently stocked.</div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-[12px] text-gray-500">Go to Purchase Orders to create the PO with these quantities.</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAutoPOModal(false)}>Close</Button>
              <Button onClick={() => { setAutoPOModal(false); window.location.href = "/purchase-orders"; }}>
                Go to Purchase Orders →
              </Button>
            </div>
          </div>
        </Modal>

        </> /* end activeTab === "schedule" */}

      </main>
    </>
  );
}
