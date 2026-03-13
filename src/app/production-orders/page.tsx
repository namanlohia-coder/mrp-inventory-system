"use client";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { getProducts, getCustomers, getMilestones, createMilestone, updateMilestone, deleteMilestone } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner, Textarea } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface Milestone {
  id: string;
  production_order_id: string;
  name: string;
  assigned_to: string;
  due_date: string | null;
  status: MilestoneStatus;
  notes: string;
  sort_order: number;
  created_at: string;
}

type OrderStatus = "Planning" | "In Training" | "In Production" | "Ready" | "Delivered";
type MilestoneStatus = "not_started" | "in_progress" | "complete" | "blocked";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "Planning", label: "Planning" },
  { value: "In Training", label: "In Training" },
  { value: "In Production", label: "In Production" },
  { value: "Ready", label: "Ready" },
  { value: "Delivered", label: "Delivered" },
];

const STATUS_FILTER = [{ value: "all", label: "All Statuses" }, ...STATUS_OPTIONS];

const MILESTONE_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "blocked", label: "Blocked" },
];

const emptyOrderForm = {
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

const emptyMilestoneForm = {
  name: "",
  assigned_to: "",
  due_date: "",
  status: "not_started" as MilestoneStatus,
  notes: "",
};

// ─── Helper functions ─────────────────────────────────────────────────────────

function statusColor(s: OrderStatus): "default" | "blue" | "orange" | "green" | "red" {
  if (s === "Planning") return "default";
  if (s === "In Training") return "blue";
  if (s === "In Production") return "orange";
  if (s === "Ready") return "green";
  if (s === "Delivered") return "green";
  return "default";
}

function milestoneStatusColor(s: MilestoneStatus): "default" | "blue" | "green" | "red" {
  if (s === "not_started") return "default";
  if (s === "in_progress") return "blue";
  if (s === "complete") return "green";
  return "red";
}

function daysFromNow(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86400000);
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function ProductionOrdersPage() {
  // Data
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Order modals
  const [addOrderModal, setAddOrderModal] = useState(false);
  const [editOrderModal, setEditOrderModal] = useState(false);
  const [materialsModal, setMaterialsModal] = useState(false);
  const [autoPOModal, setAutoPOModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
  const [orderForm, setOrderForm] = useState(emptyOrderForm);
  const [materials, setMaterials] = useState<MaterialLine[]>([]);
  const [newMatProductId, setNewMatProductId] = useState("");
  const [newMatQty, setNewMatQty] = useState("1");
  const [matSaving, setMatSaving] = useState(false);

  // Milestone modals
  const [addMilestoneModal, setAddMilestoneModal] = useState(false);
  const [editMilestoneModal, setEditMilestoneModal] = useState(false);
  const [addMilestoneOrderId, setAddMilestoneOrderId] = useState<string | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm);

  // ─── Load functions ─────────────────────────────────────────────────────────

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from("production_orders")
      .select(
        "*, customers(id, name), production_order_materials(id, production_order_id, product_id, quantity_needed, products(id, name, sku, stock))"
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load production orders");
      return;
    }
    setOrders((data as ProductionOrder[]) || []);
  };

  const loadMilestones = async () => {
    try {
      setMilestones(await getMilestones());
    } catch {
      toast.error("Failed to load milestones");
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [prods, custs] = await Promise.all([getProducts(), getCustomers()]);
        setProducts(prods);
        setCustomers(custs);
        await Promise.all([loadOrders(), loadMilestones()]);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ─── Computed values ────────────────────────────────────────────────────────

  const lowStockCount = products.filter((p: any) => p.stock <= p.reorder_point).length;

  const shortages = (() => {
    const map = new Map<string, { product: any; needed: number; stock: number }>();
    for (const order of orders) {
      if (order.status === "Delivered") continue;
      for (const mat of order.production_order_materials || []) {
        const prod = mat.products;
        if (!prod) continue;
        const needed = mat.quantity_needed * order.quantity;
        const existing = map.get(prod.id);
        if (existing) existing.needed += needed;
        else map.set(prod.id, { product: prod, needed, stock: prod.stock });
      }
    }
    return Array.from(map.values()).filter((s) => s.needed > s.stock);
  })();

  const filteredOrders = orders.filter((o) => {
    const matchSearch =
      !scheduleSearch ||
      o.order_name.toLowerCase().includes(scheduleSearch.toLowerCase()) ||
      (o.customers?.name || "").toLowerCase().includes(scheduleSearch.toLowerCase()) ||
      (o.notes || "").toLowerCase().includes(scheduleSearch.toLowerCase());
    return matchSearch && (filterStatus === "all" || o.status === filterStatus);
  });

  // ─── Helpers inside component ───────────────────────────────────────────────

  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("en-US", {
          timeZone: "UTC",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  const customerOptions = [
    { value: "", label: "No customer" },
    ...customers.map((c: any) => ({ value: c.id, label: c.name })),
  ];

  const orderOptions = [
    { value: "", label: "No production order" },
    ...orders.map((o) => ({ value: o.id, label: o.order_name })),
  ];

  const productOptions = [
    { value: "", label: "Select product..." },
    ...products.map((p: any) => ({
      value: p.id,
      label: `${p.name} (${p.sku}) — stock: ${p.stock}`,
    })),
  ];

  // ─── CRUD Handlers ──────────────────────────────────────────────────────────

  const handleAddOrder = async () => {
    if (!orderForm.order_name.trim()) return toast.error("Order name is required");
    try {
      const { error } = await supabase.from("production_orders").insert({
        order_name: orderForm.order_name.trim(),
        description: orderForm.description,
        customer_id: orderForm.customer_id || null,
        quantity: parseInt(orderForm.quantity) || 1,
        start_date: orderForm.start_date || null,
        training_date: orderForm.training_date || null,
        delivery_date: orderForm.delivery_date || null,
        status: orderForm.status,
        notes: orderForm.notes,
      });
      if (error) throw error;
      toast.success("Production order created");
      setAddOrderModal(false);
      setOrderForm(emptyOrderForm);
      loadOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    }
  };

  const openEditOrder = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setOrderForm({
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
    setEditOrderModal(true);
  };

  const handleEditOrder = async () => {
    if (!selectedOrder || !orderForm.order_name.trim()) return toast.error("Order name is required");
    try {
      const { error } = await supabase
        .from("production_orders")
        .update({
          order_name: orderForm.order_name.trim(),
          description: orderForm.description,
          customer_id: orderForm.customer_id || null,
          quantity: parseInt(orderForm.quantity) || 1,
          start_date: orderForm.start_date || null,
          training_date: orderForm.training_date || null,
          delivery_date: orderForm.delivery_date || null,
          status: orderForm.status,
          notes: orderForm.notes,
        })
        .eq("id", selectedOrder.id);
      if (error) throw error;
      toast.success("Order updated");
      setEditOrderModal(false);
      setSelectedOrder(null);
      loadOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    }
  };

  const handleDeleteOrder = async (order: ProductionOrder) => {
    if (!confirm(`Delete "${order.order_name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("production_orders").delete().eq("id", order.id);
      if (error) throw error;
      toast.success("Order deleted");
      loadOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete order");
    }
  };

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
    if (materials.some((m) => m.product_id === newMatProductId)) return toast.error("Product already added");
    setMatSaving(true);
    try {
      const { data, error } = await supabase
        .from("production_order_materials")
        .insert({
          production_order_id: selectedOrder.id,
          product_id: newMatProductId,
          quantity_needed: qty,
        })
        .select("id, production_order_id, product_id, quantity_needed, products(id, name, sku, stock)")
        .single();
      if (error) throw error;
      setMaterials((prev) => [...prev, data as unknown as MaterialLine]);
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

  const handleAddMilestone = async () => {
    if (!addMilestoneOrderId) return;
    if (!milestoneForm.name.trim()) return toast.error("Milestone name is required");
    try {
      await createMilestone({
        production_order_id: addMilestoneOrderId,
        name: milestoneForm.name.trim(),
        assigned_to: milestoneForm.assigned_to,
        due_date: milestoneForm.due_date || null,
        status: milestoneForm.status,
        notes: milestoneForm.notes,
        sort_order: milestones.filter((m) => m.production_order_id === addMilestoneOrderId).length,
      });
      toast.success("Milestone added");
      setAddMilestoneModal(false);
      setAddMilestoneOrderId(null);
      setMilestoneForm(emptyMilestoneForm);
      loadMilestones();
    } catch (err: any) {
      toast.error(err.message || "Failed to add milestone");
    }
  };

  const openEditMilestone = (m: Milestone) => {
    setSelectedMilestone(m);
    setMilestoneForm({
      name: m.name,
      assigned_to: m.assigned_to || "",
      due_date: m.due_date || "",
      status: m.status,
      notes: m.notes || "",
    });
    setEditMilestoneModal(true);
  };

  const handleEditMilestone = async () => {
    if (!selectedMilestone) return;
    if (!milestoneForm.name.trim()) return toast.error("Milestone name is required");
    try {
      await updateMilestone(selectedMilestone.id, {
        name: milestoneForm.name.trim(),
        assigned_to: milestoneForm.assigned_to,
        due_date: milestoneForm.due_date || null,
        status: milestoneForm.status,
        notes: milestoneForm.notes,
      });
      toast.success("Milestone updated");
      setEditMilestoneModal(false);
      setSelectedMilestone(null);
      setMilestoneForm(emptyMilestoneForm);
      loadMilestones();
    } catch (err: any) {
      toast.error(err.message || "Failed to update milestone");
    }
  };

  const handleDeleteMilestone = async (m: Milestone) => {
    if (!confirm(`Delete milestone "${m.name}"?`)) return;
    try {
      await deleteMilestone(m.id);
      toast.success("Milestone deleted");
      loadMilestones();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete milestone");
    }
  };

  const handleToggleMilestone = async (m: Milestone) => {
    const newStatus: MilestoneStatus = m.status === "complete" ? "not_started" : "complete";
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: newStatus } : x)));
    try {
      await updateMilestone(m.id, { status: newStatus });
    } catch {
      setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: m.status } : x)));
      toast.error("Failed to update");
    }
  };

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: prev[orderId] === false ? true : false,
    }));
  };

  // ─── Form renderer ──────────────────────────────────────────────────────────

  const renderOrderForm = (
    form: typeof emptyOrderForm,
    setForm: React.Dispatch<React.SetStateAction<typeof emptyOrderForm>>
  ) => (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Input
          label="Order Name"
          value={form.order_name}
          onChange={(e) => setForm({ ...form, order_name: e.target.value })}
          placeholder="e.g. Batch #42 – Widget Assembly"
        />
      </div>
      <div className="col-span-2">
        <Input
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <Select
        label="Customer"
        value={form.customer_id}
        onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
        options={customerOptions}
      />
      <Input
        label="Quantity"
        type="number"
        min="1"
        value={form.quantity}
        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
      />
      <Input
        label="Start Date"
        type="date"
        value={form.start_date}
        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
      />
      <Input
        label="Training Date"
        type="date"
        value={form.training_date}
        onChange={(e) => setForm({ ...form, training_date: e.target.value })}
      />
      <Input
        label="Delivery Date"
        type="date"
        value={form.delivery_date}
        onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
      />
      <Select
        label="Status"
        value={form.status}
        onChange={(e) => setForm({ ...form, status: e.target.value as OrderStatus })}
        options={STATUS_OPTIONS}
      />
      <div className="col-span-2">
        <Textarea
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </div>
  );

  const renderMilestoneForm = (
    form: typeof emptyMilestoneForm,
    setForm: React.Dispatch<React.SetStateAction<typeof emptyMilestoneForm>>
  ) => (
    <div className="flex flex-col gap-4">
      <Input
        label="Milestone Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="e.g. Design Review"
      />
      <Input
        label="Assigned To"
        value={form.assigned_to}
        onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
        placeholder="e.g. John Smith"
      />
      <Input
        label="Due Date"
        type="date"
        value={form.due_date}
        onChange={(e) => setForm({ ...form, due_date: e.target.value })}
      />
      <Select
        label="Status"
        value={form.status}
        onChange={(e) => setForm({ ...form, status: e.target.value as MilestoneStatus })}
        options={MILESTONE_STATUS_OPTIONS}
      />
      <Textarea
        label="Notes"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
    </div>
  );

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Header lowStockCount={0} />
        <main className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </main>
      </>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">

        {/* Top controls */}
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
            <Button
              onClick={() => {
                setOrderForm(emptyOrderForm);
                setAddOrderModal(true);
              }}
            >
              + New Production Order
            </Button>
          </div>
        </div>

        {/* Search + filter */}
        <div className="mb-5 flex gap-3 items-center">
          <input
            type="text"
            placeholder="Search by order name, customer, notes..."
            value={scheduleSearch}
            onChange={(e) => setScheduleSearch(e.target.value)}
            className="w-full max-w-sm bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#0B0F19] border border-border rounded-lg px-3 py-2 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
          >
            {STATUS_FILTER.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-gray-500">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Order cards */}
        {filteredOrders.length === 0 ? (
          <EmptyState
            icon="⚙"
            title="No production orders"
            sub="Create your first production order to get started"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {filteredOrders.map((order) => {
              const orderMs = milestones
                .filter((m) => m.production_order_id === order.id)
                .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
              const mComplete = orderMs.filter((m) => m.status === "complete").length;
              const mPct = orderMs.length > 0 ? (mComplete / orderMs.length) * 100 : 0;
              const nextM = orderMs.find((m) => m.status !== "complete" && m.due_date);
              const delivDays = daysFromNow(order.delivery_date);
              const trainDays = daysFromNow(order.training_date);
              const isOverdue = delivDays !== null && delivDays < 0 && order.status !== "Delivered";
              const isExpanded = expandedOrders[order.id] !== false; // default expanded
              const mats = order.production_order_materials || [];
              const hasShortage = mats.some(
                (m) => (m.products?.stock ?? 0) < m.quantity_needed * order.quantity
              );

              return (
                <div
                  key={order.id}
                  className={`bg-surface-card border rounded-[14px] overflow-hidden ${
                    isOverdue ? "border-red-500/30" : "border-border"
                  }`}
                >
                  {/* Order header row */}
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: order info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[14px] font-bold text-gray-100">{order.order_name}</span>
                          <Badge color={statusColor(order.status)}>{order.status}</Badge>
                          {isOverdue && <Badge color="red">Overdue</Badge>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[12px] text-gray-500 flex-wrap">
                          {order.customers?.name && <span>{order.customers.name}</span>}
                          <span>Qty: {order.quantity}</span>
                          {order.start_date && <span>Start: {fmtDate(order.start_date)}</span>}
                          {order.training_date && (
                            <span>
                              Training: {fmtDate(order.training_date)}
                              {trainDays !== null && (
                                <span
                                  className={`ml-1 font-semibold ${
                                    trainDays < 0
                                      ? "text-amber-400"
                                      : trainDays === 0
                                      ? "text-brand"
                                      : trainDays <= 7
                                      ? "text-amber-400"
                                      : ""
                                  }`}
                                >
                                  ({trainDays < 0 ? `${Math.abs(trainDays)}d ago` : trainDays === 0 ? "today" : `${trainDays}d`})
                                </span>
                              )}
                            </span>
                          )}
                          {order.delivery_date && (
                            <span>
                              Delivery: {fmtDate(order.delivery_date)}
                              {delivDays !== null && (
                                <span
                                  className={`ml-1 font-semibold ${
                                    delivDays < 0
                                      ? "text-red-400"
                                      : delivDays <= 3
                                      ? "text-amber-400"
                                      : delivDays <= 14
                                      ? "text-yellow-500"
                                      : "text-emerald-400"
                                  }`}
                                >
                                  (
                                  {delivDays < 0
                                    ? `${Math.abs(delivDays)}d overdue`
                                    : delivDays === 0
                                    ? "today"
                                    : `${delivDays}d`}
                                  )
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {/* Milestone progress bar */}
                        {orderMs.length > 0 && (
                          <div className="mt-2.5 max-w-xs">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="text-gray-500 truncate mr-2">
                                {nextM ? `Next: ${nextM.name}` : "All milestones complete"}
                              </span>
                              <span className="text-emerald-400 font-semibold shrink-0">
                                {mComplete}/{orderMs.length}
                              </span>
                            </div>
                            <div className="h-1.5 bg-[#0B0F19] rounded-full overflow-hidden border border-border">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${mPct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Right: actions */}
                      <div className="flex items-center gap-2 shrink-0">
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
                            ? `${mats.length} mat${mats.length !== 1 ? "s" : ""}${hasShortage ? " ⚠" : " ✓"}`
                            : "Materials"}
                        </button>
                        <button
                          onClick={() => toggleOrderExpanded(order.id)}
                          className="text-[12px] text-gray-400 hover:text-gray-200 px-2.5 py-1 rounded-md border border-border bg-transparent cursor-pointer transition-colors"
                        >
                          {isExpanded ? "▼" : "▶"} {orderMs.length} milestone{orderMs.length !== 1 ? "s" : ""}
                        </button>
                        <Button size="sm" variant="ghost" onClick={() => openEditOrder(order)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteOrder(order)}
                          className="!text-red-400"
                        >
                          Del
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expandable milestones section */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      <div className="flex items-center justify-between px-5 py-2.5 bg-surface-hover/30">
                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          Milestones
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setAddMilestoneOrderId(order.id);
                            setMilestoneForm(emptyMilestoneForm);
                            setAddMilestoneModal(true);
                          }}
                        >
                          + Add
                        </Button>
                      </div>
                      {orderMs.length === 0 ? (
                        <div className="px-5 py-4 text-[13px] text-gray-500 text-center">
                          No milestones yet. Add one to start tracking progress.
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {orderMs.map((m) => {
                            const mDays = daysFromNow(m.due_date);
                            const mOverdue = m.status !== "complete" && mDays !== null && mDays < 0;
                            return (
                              <div
                                key={m.id}
                                className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-hover transition-colors ${
                                  mOverdue ? "bg-red-500/5" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={m.status === "complete"}
                                  onChange={() => handleToggleMilestone(m)}
                                  className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <span
                                    className={`text-[13px] font-medium ${
                                      m.status === "complete" ? "line-through text-gray-500" : "text-gray-100"
                                    }`}
                                  >
                                    {m.name}
                                  </span>
                                  {m.assigned_to && (
                                    <span className="ml-3 text-[12px] text-gray-500">↳ {m.assigned_to}</span>
                                  )}
                                </div>
                                {m.due_date && (
                                  <span
                                    className={`text-[12px] whitespace-nowrap ${
                                      mOverdue ? "text-red-400 font-semibold" : "text-gray-500"
                                    }`}
                                  >
                                    {fmtDate(m.due_date)}
                                    {mDays !== null && m.status !== "complete" && (
                                      <span className="ml-1">
                                        {mDays < 0
                                          ? `(${Math.abs(mDays)}d overdue)`
                                          : mDays === 0
                                          ? "(today)"
                                          : mDays <= 7
                                          ? `(${mDays}d)`
                                          : ""}
                                      </span>
                                    )}
                                  </span>
                                )}
                                <Badge color={milestoneStatusColor(m.status)}>
                                  {m.status.replace("_", " ")}
                                </Badge>
                                <div className="flex gap-1 shrink-0">
                                  <Button size="sm" variant="ghost" onClick={() => openEditMilestone(m)}>
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteMilestone(m)}
                                    className="!text-red-400"
                                  >
                                    Del
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Modal: New Production Order ─────────────────────────────────────── */}
        <Modal
          open={addOrderModal}
          onClose={() => {
            setAddOrderModal(false);
            setOrderForm(emptyOrderForm);
          }}
          title="New Production Order"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setAddOrderModal(false);
                  setOrderForm(emptyOrderForm);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleAddOrder}>Create Order</Button>
            </div>
          }
        >
          {renderOrderForm(orderForm, setOrderForm)}
        </Modal>

        {/* ── Modal: Edit Production Order ────────────────────────────────────── */}
        <Modal
          open={editOrderModal}
          onClose={() => {
            setEditOrderModal(false);
            setSelectedOrder(null);
          }}
          title="Edit Production Order"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditOrderModal(false);
                  setSelectedOrder(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleEditOrder}>Save Changes</Button>
            </div>
          }
        >
          {renderOrderForm(orderForm, setOrderForm)}
        </Modal>

        {/* ── Modal: Materials ────────────────────────────────────────────────── */}
        <Modal
          open={materialsModal}
          onClose={() => {
            setMaterialsModal(false);
            setSelectedOrder(null);
          }}
          title={`Materials — ${selectedOrder?.order_name || ""}`}
          footer={
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setMaterialsModal(false);
                  setSelectedOrder(null);
                }}
              >
                Done
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            {/* Materials table */}
            {materials.length === 0 ? (
              <p className="text-[13px] text-gray-500 text-center py-4">
                No materials added yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-border">
                      <th className="pb-2 pr-4">Product</th>
                      <th className="pb-2 pr-4">SKU</th>
                      <th className="pb-2 pr-4 text-right">Per Unit</th>
                      <th className="pb-2 pr-4 text-right">Total Needed</th>
                      <th className="pb-2 pr-4 text-right">In Stock</th>
                      <th className="pb-2 text-right">Status</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {materials.map((mat) => {
                      const totalNeeded = mat.quantity_needed * (selectedOrder?.quantity ?? 1);
                      const stock = mat.products?.stock ?? 0;
                      const shortage = totalNeeded > stock;
                      return (
                        <tr key={mat.id} className="hover:bg-surface-hover transition-colors">
                          <td className="py-2.5 pr-4 text-gray-100 font-medium">
                            {mat.products?.name || "Unknown"}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-500">{mat.products?.sku || "—"}</td>
                          <td className="py-2.5 pr-4 text-right text-gray-300">{mat.quantity_needed}</td>
                          <td className="py-2.5 pr-4 text-right text-gray-300">{totalNeeded}</td>
                          <td
                            className={`py-2.5 pr-4 text-right font-semibold ${
                              shortage ? "text-red-400" : "text-emerald-400"
                            }`}
                          >
                            {stock}
                          </td>
                          <td className="py-2.5 text-right">
                            {shortage ? (
                              <Badge color="red">Short {totalNeeded - stock}</Badge>
                            ) : (
                              <Badge color="green">OK</Badge>
                            )}
                          </td>
                          <td className="py-2.5 pl-3">
                            <button
                              onClick={() => handleRemoveMaterial(mat.id)}
                              className="text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer bg-transparent border-none"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add Material form */}
            <div className="border-t border-border pt-4">
              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-3">Add Material</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select
                    label="Product"
                    value={newMatProductId}
                    onChange={(e) => setNewMatProductId(e.target.value)}
                    options={productOptions}
                  />
                </div>
                <div className="w-24">
                  <Input
                    label="Qty / Unit"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newMatQty}
                    onChange={(e) => setNewMatQty(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddMaterial} disabled={matSaving}>
                  {matSaving ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          </div>
        </Modal>

        {/* ── Modal: Auto-Generate PO ─────────────────────────────────────────── */}
        <Modal
          open={autoPOModal}
          onClose={() => setAutoPOModal(false)}
          title="Material Shortages — Auto-Generate Purchase Order"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAutoPOModal(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  toast.success("Purchase order generation coming soon");
                  setAutoPOModal(false);
                }}
              >
                Generate PO
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-gray-400">
              The following materials are insufficient to fulfil all active production orders.
            </p>
            {shortages.length === 0 ? (
              <p className="text-[13px] text-emerald-400 text-center py-4">No shortages detected.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-border">
                      <th className="pb-2 pr-4">Product</th>
                      <th className="pb-2 pr-4 text-right">In Stock</th>
                      <th className="pb-2 pr-4 text-right">Total Needed</th>
                      <th className="pb-2 text-right">Order Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shortages.map((s) => (
                      <tr key={s.product.id} className="hover:bg-surface-hover transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="text-gray-100 font-medium">{s.product.name}</div>
                          <div className="text-[11px] text-gray-500">{s.product.sku}</div>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-red-400 font-semibold">{s.stock}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-300">{s.needed}</td>
                        <td className="py-2.5 text-right text-amber-400 font-bold">
                          {s.needed - s.stock}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>

        {/* ── Modal: Add Milestone ────────────────────────────────────────────── */}
        <Modal
          open={addMilestoneModal}
          onClose={() => {
            setAddMilestoneModal(false);
            setAddMilestoneOrderId(null);
            setMilestoneForm(emptyMilestoneForm);
          }}
          title="Add Milestone"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setAddMilestoneModal(false);
                  setAddMilestoneOrderId(null);
                  setMilestoneForm(emptyMilestoneForm);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleAddMilestone}>Add Milestone</Button>
            </div>
          }
        >
          {renderMilestoneForm(milestoneForm, setMilestoneForm)}
        </Modal>

        {/* ── Modal: Edit Milestone ───────────────────────────────────────────── */}
        <Modal
          open={editMilestoneModal}
          onClose={() => {
            setEditMilestoneModal(false);
            setSelectedMilestone(null);
            setMilestoneForm(emptyMilestoneForm);
          }}
          title="Edit Milestone"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditMilestoneModal(false);
                  setSelectedMilestone(null);
                  setMilestoneForm(emptyMilestoneForm);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleEditMilestone}>Save Changes</Button>
            </div>
          }
        >
          {renderMilestoneForm(milestoneForm, setMilestoneForm)}
        </Modal>
      </main>
    </>
  );
}
