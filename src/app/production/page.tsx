"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import {
  getProducts, getCustomers,
  getProductionParts, createProductionPart, updateProductionPart, deleteProductionPart,
  getProductionInvoices, createProductionInvoice, updateProductionInvoice, deleteProductionInvoice,
  getMilestones, createMilestone, updateMilestone, deleteMilestone,
} from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner, Textarea } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

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
  production_orders?: { id: string; order_name: string } | null;
  products?: { id: string; name: string; sku: string; stock: number } | null;
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
  production_orders?: { id: string; order_name: string } | null;
}

type OrderStatus = "Planning" | "In Training" | "In Production" | "Ready" | "Delivered";
type MilestoneStatus = "not_started" | "in_progress" | "complete" | "blocked";
type ActiveTab = "schedule" | "parts" | "invoices" | "milestones";

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
  production_orders?: { id: string; order_name: string; delivery_date: string | null; customers?: { id: string; name: string } | null } | null;
}

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
  return "red";
}

const emptyOrderForm = {
  order_name: "", description: "", customer_id: "", quantity: "1",
  start_date: "", training_date: "", delivery_date: "",
  status: "Planning" as OrderStatus, notes: "",
};

const emptyPartForm = {
  part_name: "", product_id: "", qty_needed: "1",
  production_order_id: "", po_number: "", notes: "",
};

const emptyInvoiceForm = {
  vendor_name: "", invoice_number: "", amount: "",
  date: "", production_order_id: "", notes: "",
};

const emptyMilestoneForm = {
  name: "", assigned_to: "", due_date: "",
  status: "not_started" as MilestoneStatus, notes: "",
};

const MILESTONE_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "blocked", label: "Blocked" },
];

function milestoneStatusColor(s: MilestoneStatus): "default" | "blue" | "green" | "red" {
  if (s === "not_started") return "default";
  if (s === "in_progress") return "blue";
  if (s === "complete") return "green";
  return "red";
}

function daysFromNow(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// ─── Product ComboBox ─────────────────────────────────────────────────────────

function ProductComboBox({
  value, onChange, products, label,
}: {
  value: string;
  onChange: (id: string, name: string) => void;
  products: any[];
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = products.find((p) => p.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      {label && <label className="text-xs text-gray-400 font-medium">{label}</label>}
      <div
        className="bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-gray-200 cursor-pointer flex justify-between items-center"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
      >
        <span className={current ? "text-gray-200" : "text-gray-600"}>
          {current ? `${current.name} (${current.sku})` : "Select product..."}
        </span>
        <span className="text-gray-500 text-[10px]">▼</span>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[#151D2E] border border-border rounded-xl shadow-2xl overflow-hidden" style={{ maxWidth: 480 }}>
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or SKU..."
              className="w-full bg-[#0B0F19] border border-border rounded-lg px-3 py-2 text-[13px] text-gray-200 outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <div
              className="px-3 py-2 text-[13px] text-gray-500 hover:bg-surface-hover cursor-pointer"
              onClick={() => { onChange("", ""); setOpen(false); }}
            >
              None
            </div>
            {filtered.slice(0, 50).map((p) => (
              <div
                key={p.id}
                className="px-3 py-2 text-[13px] text-gray-200 hover:bg-surface-hover cursor-pointer flex justify-between"
                onClick={() => { onChange(p.id, p.name); setOpen(false); }}
              >
                <span>{p.name}</span>
                <span className="text-gray-500 font-mono text-[11px]">{p.sku} · stock: {p.stock}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-[13px] text-gray-500 text-center">No products found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("schedule");
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Schedule state ────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
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
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // ── Parts state ───────────────────────────────────────────────────────────
  const [parts, setParts] = useState<ProductionPart[]>([]);
  const [addPartModal, setAddPartModal] = useState(false);
  const [editPartModal, setEditPartModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<ProductionPart | null>(null);
  const [partForm, setPartForm] = useState(emptyPartForm);

  // ── Milestone state ───────────────────────────────────────────────────────
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [addMilestoneOrderId, setAddMilestoneOrderId] = useState<string | null>(null);
  const [addMilestoneModal, setAddMilestoneModal] = useState(false);
  const [editMilestoneModal, setEditMilestoneModal] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm);

  // ── Invoice state ─────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<ProductionInvoice[]>([]);
  const [addInvoiceModal, setAddInvoiceModal] = useState(false);
  const [editInvoiceModal, setEditInvoiceModal] = useState(false);
  const [parseConfirmModal, setParseConfirmModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<ProductionInvoice | null>(null);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const [parsedPdfBase64, setParsedPdfBase64] = useState("");
  const [parsedFileName, setParsedFileName] = useState("");
  const [parsedLineItems, setParsedLineItems] = useState<any[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from("production_orders")
      .select(`*, customers(id, name), production_order_materials(id, production_order_id, product_id, quantity_needed, products(id, name, sku, stock))`)
      .order("created_at", { ascending: false });
    if (error) { toast.error("Failed to load production orders"); return; }
    setOrders((data as ProductionOrder[]) || []);
  };

  const loadParts = async () => {
    try {
      setParts(await getProductionParts());
    } catch { toast.error("Failed to load parts"); }
  };

  const loadInvoices = async () => {
    try {
      setInvoices(await getProductionInvoices());
    } catch { toast.error("Failed to load invoices"); }
  };

  const loadMilestones = async () => {
    try {
      setMilestones(await getMilestones());
    } catch { toast.error("Failed to load milestones"); }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [prods, custs] = await Promise.all([getProducts(), getCustomers()]);
        setProducts(prods);
        setCustomers(custs);
        await Promise.all([loadOrders(), loadParts(), loadInvoices(), loadMilestones()]);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const lowStockCount = products.filter((p: any) => p.stock <= p.reorder_point).length;

  // ── Schedule CRUD ─────────────────────────────────────────────────────────

  const handleAddOrder = async () => {
    if (!orderForm.order_name.trim()) return toast.error("Order name is required");
    try {
      const { error } = await supabase.from("production_orders").insert({
        order_name: orderForm.order_name.trim(), description: orderForm.description,
        customer_id: orderForm.customer_id || null, quantity: parseInt(orderForm.quantity) || 1,
        start_date: orderForm.start_date || null, training_date: orderForm.training_date || null,
        delivery_date: orderForm.delivery_date || null, status: orderForm.status, notes: orderForm.notes,
      });
      if (error) throw error;
      toast.success("Production order created");
      setAddOrderModal(false); setOrderForm(emptyOrderForm); loadOrders();
    } catch (err: any) { toast.error(err.message || "Failed to create order"); }
  };

  const openEditOrder = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setOrderForm({
      order_name: order.order_name, description: order.description || "",
      customer_id: order.customer_id || "", quantity: String(order.quantity),
      start_date: order.start_date || "", training_date: order.training_date || "",
      delivery_date: order.delivery_date || "", status: order.status, notes: order.notes || "",
    });
    setEditOrderModal(true);
  };

  const handleEditOrder = async () => {
    if (!selectedOrder || !orderForm.order_name.trim()) return toast.error("Order name is required");
    try {
      const { error } = await supabase.from("production_orders").update({
        order_name: orderForm.order_name.trim(), description: orderForm.description,
        customer_id: orderForm.customer_id || null, quantity: parseInt(orderForm.quantity) || 1,
        start_date: orderForm.start_date || null, training_date: orderForm.training_date || null,
        delivery_date: orderForm.delivery_date || null, status: orderForm.status, notes: orderForm.notes,
      }).eq("id", selectedOrder.id);
      if (error) throw error;
      toast.success("Order updated"); setEditOrderModal(false); setSelectedOrder(null); loadOrders();
    } catch (err: any) { toast.error(err.message || "Failed to update order"); }
  };

  const handleDeleteOrder = async (order: ProductionOrder) => {
    if (!confirm(`Delete production order "${order.order_name}"?`)) return;
    try {
      const { error } = await supabase.from("production_orders").delete().eq("id", order.id);
      if (error) throw error;
      toast.success("Order deleted"); loadOrders();
    } catch { toast.error("Failed to delete order"); }
  };

  const openMaterials = (order: ProductionOrder) => {
    setSelectedOrder(order); setMaterials(order.production_order_materials || []);
    setNewMatProductId(""); setNewMatQty("1"); setMaterialsModal(true);
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
        .insert({ production_order_id: selectedOrder.id, product_id: newMatProductId, quantity_needed: qty })
        .select("id, production_order_id, product_id, quantity_needed, products(id, name, sku, stock)")
        .single();
      if (error) throw error;
      setMaterials((prev) => [...prev, data as MaterialLine]);
      setNewMatProductId(""); setNewMatQty("1"); loadOrders();
    } catch (err: any) { toast.error(err.message || "Failed to add material"); }
    finally { setMatSaving(false); }
  };

  const handleRemoveMaterial = async (matId: string) => {
    try {
      const { error } = await supabase.from("production_order_materials").delete().eq("id", matId);
      if (error) throw error;
      setMaterials((prev) => prev.filter((m) => m.id !== matId)); loadOrders();
    } catch { toast.error("Failed to remove material"); }
  };

  const shortages = (() => {
    const map = new Map<string, { product: any; needed: number; stock: number }>();
    for (const order of orders) {
      if (order.status === "Delivered") continue;
      for (const mat of order.production_order_materials || []) {
        const prod = mat.products; if (!prod) continue;
        const needed = mat.quantity_needed * order.quantity;
        const existing = map.get(prod.id);
        if (existing) { existing.needed += needed; }
        else { map.set(prod.id, { product: prod, needed, stock: prod.stock }); }
      }
    }
    return Array.from(map.values()).filter((s) => s.needed > s.stock);
  })();

  const filteredOrders = orders.filter((o) => {
    const matchSearch = !scheduleSearch ||
      o.order_name.toLowerCase().includes(scheduleSearch.toLowerCase()) ||
      (o.customers?.name || "").toLowerCase().includes(scheduleSearch.toLowerCase()) ||
      (o.notes || "").toLowerCase().includes(scheduleSearch.toLowerCase());
    return matchSearch && (filterStatus === "all" || o.status === filterStatus);
  });

  // ── Parts CRUD ────────────────────────────────────────────────────────────

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
      toast.success("Part added"); setAddPartModal(false); setPartForm(emptyPartForm); loadParts();
    } catch (err: any) { toast.error(err.message || "Failed to add part"); }
  };

  const openEditPart = (part: ProductionPart) => {
    setSelectedPart(part);
    setPartForm({
      part_name: part.part_name, product_id: part.product_id || "",
      qty_needed: String(part.qty_needed), production_order_id: part.production_order_id || "",
      po_number: part.po_number || "", notes: part.notes || "",
    });
    setEditPartModal(true);
  };

  const handleEditPart = async () => {
    if (!selectedPart || !partForm.part_name.trim()) return toast.error("Part name is required");
    try {
      await updateProductionPart(selectedPart.id, {
        part_name: partForm.part_name.trim(),
        product_id: partForm.product_id || null,
        qty_needed: parseFloat(partForm.qty_needed) || 1,
        production_order_id: partForm.production_order_id || null,
        po_number: partForm.po_number, notes: partForm.notes,
      });
      toast.success("Part updated"); setEditPartModal(false); setSelectedPart(null); loadParts();
    } catch (err: any) { toast.error(err.message || "Failed to update part"); }
  };

  const handleDeletePart = async (part: ProductionPart) => {
    if (!confirm(`Delete part "${part.part_name}"?`)) return;
    try {
      await deleteProductionPart(part.id);
      toast.success("Part deleted"); loadParts();
    } catch { toast.error("Failed to delete part"); }
  };

  const handleTogglePart = async (part: ProductionPart, field: "is_ordered" | "is_received") => {
    const newVal = !part[field];
    // Optimistic update
    setParts((prev) => prev.map((p) => p.id === part.id ? { ...p, [field]: newVal } : p));
    try {
      await updateProductionPart(part.id, { [field]: newVal });
    } catch (err: any) {
      // Revert on failure
      setParts((prev) => prev.map((p) => p.id === part.id ? { ...p, [field]: part[field] } : p));
      toast.error(err.message || "Failed to update");
    }
  };

  // ── Invoice CRUD + Parse ──────────────────────────────────────────────────

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
      setParsedLineItems(parsed.line_items || parsed.parsed_data || []);
      setParseConfirmModal(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse invoice");
    } finally {
      setParseLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveInvoice = async () => {
    if (!invoiceForm.vendor_name.trim()) return toast.error("Vendor name is required");
    try {
      await createProductionInvoice({
        vendor_name: invoiceForm.vendor_name.trim(),
        invoice_number: invoiceForm.invoice_number,
        amount: parseFloat(invoiceForm.amount) || 0,
        date: invoiceForm.date || null,
        production_order_id: invoiceForm.production_order_id || null,
        file_name: parsedFileName,
        file_url: parsedPdfBase64,
        notes: invoiceForm.notes,
        parsed_data: parsedLineItems,
      });
      toast.success("Invoice saved");
      setParseConfirmModal(false); setInvoiceForm(emptyInvoiceForm);
      setParsedPdfBase64(""); setParsedFileName(""); setParsedLineItems([]);
      loadInvoices();
    } catch (err: any) { toast.error(err.message || "Failed to save invoice"); }
  };

  const openEditInvoice = (inv: ProductionInvoice) => {
    setSelectedInvoice(inv);
    setInvoiceForm({
      vendor_name: inv.vendor_name || "", invoice_number: inv.invoice_number || "",
      amount: String(inv.amount || ""), date: inv.date || "",
      production_order_id: inv.production_order_id || "", notes: inv.notes || "",
    });
    setEditInvoiceModal(true);
  };

  const handleEditInvoice = async () => {
    if (!selectedInvoice || !invoiceForm.vendor_name.trim()) return toast.error("Vendor name is required");
    try {
      await updateProductionInvoice(selectedInvoice.id, {
        vendor_name: invoiceForm.vendor_name.trim(),
        invoice_number: invoiceForm.invoice_number,
        amount: parseFloat(invoiceForm.amount) || 0,
        date: invoiceForm.date || null,
        production_order_id: invoiceForm.production_order_id || null,
        notes: invoiceForm.notes,
      });
      toast.success("Invoice updated"); setEditInvoiceModal(false); setSelectedInvoice(null); loadInvoices();
    } catch (err: any) { toast.error(err.message || "Failed to update invoice"); }
  };

  const handleDeleteInvoice = async (inv: ProductionInvoice) => {
    if (!confirm(`Delete invoice from "${inv.vendor_name}"?`)) return;
    try {
      await deleteProductionInvoice(inv.id);
      toast.success("Invoice deleted"); loadInvoices();
    } catch { toast.error("Failed to delete invoice"); }
  };

  // ── Milestone CRUD ────────────────────────────────────────────────────────

  const openAddMilestone = (orderId: string) => {
    setAddMilestoneOrderId(orderId);
    setMilestoneForm(emptyMilestoneForm);
    setAddMilestoneModal(true);
  };

  const handleAddMilestone = async () => {
    if (!addMilestoneOrderId || !milestoneForm.name.trim()) return toast.error("Name is required");
    try {
      await createMilestone({
        production_order_id: addMilestoneOrderId,
        name: milestoneForm.name.trim(),
        assigned_to: milestoneForm.assigned_to,
        due_date: milestoneForm.due_date || null,
        status: milestoneForm.status,
        notes: milestoneForm.notes,
      });
      toast.success("Milestone added");
      setAddMilestoneModal(false); setAddMilestoneOrderId(null); loadMilestones();
    } catch (err: any) { toast.error(err.message || "Failed to add milestone"); }
  };

  const openEditMilestone = (m: Milestone) => {
    setSelectedMilestone(m);
    setMilestoneForm({ name: m.name, assigned_to: m.assigned_to || "", due_date: m.due_date || "", status: m.status, notes: m.notes || "" });
    setEditMilestoneModal(true);
  };

  const handleEditMilestone = async () => {
    if (!selectedMilestone || !milestoneForm.name.trim()) return toast.error("Name is required");
    try {
      await updateMilestone(selectedMilestone.id, {
        name: milestoneForm.name.trim(), assigned_to: milestoneForm.assigned_to,
        due_date: milestoneForm.due_date || null, status: milestoneForm.status, notes: milestoneForm.notes,
      });
      toast.success("Milestone updated"); setEditMilestoneModal(false); setSelectedMilestone(null); loadMilestones();
    } catch (err: any) { toast.error(err.message || "Failed to update milestone"); }
  };

  const handleDeleteMilestone = async (m: Milestone) => {
    if (!confirm(`Delete milestone "${m.name}"?`)) return;
    try { await deleteMilestone(m.id); toast.success("Milestone deleted"); loadMilestones(); }
    catch { toast.error("Failed to delete milestone"); }
  };

  const handleToggleMilestone = async (m: Milestone) => {
    const newStatus: MilestoneStatus = m.status === "complete" ? "not_started" : "complete";
    setMilestones((prev) => prev.map((x) => x.id === m.id ? { ...x, status: newStatus } : x));
    try { await updateMilestone(m.id, { status: newStatus }); }
    catch { setMilestones((prev) => prev.map((x) => x.id === m.id ? { ...x, status: m.status } : x)); toast.error("Failed to update"); }
  };

  const toggleOrderExpanded = (orderId: string) =>
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "—";

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
    ...products.map((p: any) => ({ value: p.id, label: `${p.name} (${p.sku}) — stock: ${p.stock}` })),
  ];

  const renderOrderForm = (form: typeof emptyOrderForm, setForm: (f: typeof emptyOrderForm) => void) => (
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

  const renderPartForm = (form: typeof emptyPartForm, setForm: (f: typeof emptyPartForm) => void) => (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 relative">
        <ProductComboBox
          label="Product (from inventory)"
          value={form.product_id}
          products={products}
          onChange={(id, name) => setForm({ ...form, product_id: id, part_name: name || form.part_name })}
        />
      </div>
      <div className="col-span-2">
        <Input label="Part Name" value={form.part_name} onChange={(e) => setForm({ ...form, part_name: e.target.value })} placeholder="Part name (auto-filled from product)" />
      </div>
      <Input label="Qty Needed" type="number" min="0.001" step="any" value={form.qty_needed} onChange={(e) => setForm({ ...form, qty_needed: e.target.value })} />
      <Select label="Linked Production Order" value={form.production_order_id} onChange={(e) => setForm({ ...form, production_order_id: e.target.value })} options={orderOptions} />
      <Input label="PO #" value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} placeholder="PO number..." />
      <div />
      <div className="col-span-2">
        <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." />
      </div>
    </div>
  );

  const renderInvoiceForm = (form: typeof emptyInvoiceForm, setForm: (f: typeof emptyInvoiceForm) => void) => (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Input label="Vendor Name" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} placeholder="Vendor / supplier..." />
      </div>
      <Input label="Invoice #" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} placeholder="INV-0001" />
      <Input label="Amount (USD)" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
      <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Select label="Linked Production Order" value={form.production_order_id} onChange={(e) => setForm({ ...form, production_order_id: e.target.value })} options={orderOptions} />
      <div className="col-span-2">
        <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." />
      </div>
    </div>
  );

  if (loading) return <LoadingSpinner />;

  // ─── Parts summary ────────────────────────────────────────────────────────
  const totalParts = parts.length;
  const orderedParts = parts.filter((p) => p.is_ordered).length;
  const receivedParts = parts.filter((p) => p.is_received).length;
  const outstandingParts = parts.filter((p) => !p.is_received).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">

        {/* Tabs */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-2">
            {(["schedule", "parts", "invoices", "milestones"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all cursor-pointer ${
                  activeTab === t
                    ? "bg-brand/20 border-brand text-brand"
                    : "bg-surface-card border-border text-gray-400 hover:border-border-light"
                }`}
              >
                {t === "schedule" ? `Production Schedule (${orders.length})`
                  : t === "parts" ? `Parts to Order (${totalParts})`
                  : t === "invoices" ? `Invoices (${invoices.length})`
                  : `Milestones (${milestones.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB 1 — SCHEDULE
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "schedule" && <>

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Total Orders</div>
                <div className="text-[18px] font-bold text-gray-100">{orders.length}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Active</div>
                <div className="text-[18px] font-bold text-blue-400">{orders.filter((o) => o.status !== "Delivered").length}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Material Shortages</div>
                <div className={`text-[18px] font-bold ${shortages.length > 0 ? "text-red-400" : "text-emerald-400"}`}>{shortages.length}</div>
              </div>
            </div>
            <div className="flex gap-2">
              {shortages.length > 0 && (
                <Button variant="secondary" onClick={() => setAutoPOModal(true)}>⚠ Auto-Generate PO ({shortages.length})</Button>
              )}
              <Button onClick={() => { setOrderForm(emptyOrderForm); setAddOrderModal(true); }}>+ New Production Order</Button>
            </div>
          </div>

          <div className="mb-5 flex gap-3 items-center">
            <input type="text" placeholder="Search by order name, customer, notes..." value={scheduleSearch}
              onChange={(e) => setScheduleSearch(e.target.value)}
              className="w-full max-w-sm bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#0B0F19] border border-border rounded-lg px-3 py-2 text-[13px] text-gray-100 focus:outline-none focus:border-brand">
              {STATUS_FILTER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="text-[12px] text-gray-500">{filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}</span>
          </div>

          {filteredOrders.length > 0 ? (
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
                  {filteredOrders.map((order) => {
                    const mats = order.production_order_materials || [];
                    const hasShortage = mats.some((m) => (m.products?.stock ?? 0) < m.quantity_needed * order.quantity);
                    return (
                      <tr key={order.id} className="border-b border-border hover:bg-surface-hover transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="text-[13px] text-gray-100 font-medium">{order.order_name}</div>
                          {order.description && <div className="text-[11px] text-gray-500 mt-0.5 max-w-[200px] truncate">{order.description}</div>}
                          {(() => {
                            const orderMs = milestones.filter((m) => m.production_order_id === order.id);
                            if (orderMs.length === 0) return null;
                            const complete = orderMs.filter((m) => m.status === "complete").length;
                            const pct = (complete / orderMs.length) * 100;
                            const nextM = orderMs
                              .filter((m) => m.status !== "complete" && m.due_date)
                              .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))[0];
                            return (
                              <div className="mt-1.5 max-w-[220px]">
                                <div className="flex items-center justify-between text-[10px] mb-0.5">
                                  <span className="text-gray-500 truncate mr-2">
                                    {nextM ? `Next: ${nextM.name}` : "All milestones complete"}
                                  </span>
                                  <span className="text-emerald-400 font-semibold shrink-0">{complete}/{orderMs.length}</span>
                                </div>
                                <div className="h-1 bg-[#0B0F19] rounded-full overflow-hidden border border-border">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-300">{order.customers?.name || "—"}</td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-100 font-mono text-center">{order.quantity}</td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-400 whitespace-nowrap">{fmtDate(order.start_date)}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="text-[13px] text-gray-400">{fmtDate(order.training_date)}</div>
                          {(() => {
                            const d = daysFromNow(order.training_date);
                            if (d === null) return null;
                            return (
                              <div className={`text-[11px] font-semibold mt-0.5 ${d < 0 ? "text-amber-400" : d === 0 ? "text-brand" : d <= 7 ? "text-amber-400" : "text-gray-600"}`}>
                                {d < 0 ? `${Math.abs(d)}d ago` : d === 0 ? "Today" : `${d}d`}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="text-[13px] text-gray-400">{fmtDate(order.delivery_date)}</div>
                          {(() => {
                            const d = daysFromNow(order.delivery_date);
                            if (d === null) return null;
                            return (
                              <div className={`text-[11px] font-semibold mt-0.5 ${d < 0 ? "text-red-400" : d <= 3 ? "text-amber-400" : d <= 14 ? "text-yellow-500" : "text-emerald-400"}`}>
                                {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `${d}d`}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-center"><Badge color={statusColor(order.status)}>{order.status}</Badge></td>
                        <td className="px-4 py-3.5 text-center">
                          <button onClick={() => openMaterials(order)}
                            className={`text-[12px] font-medium px-2.5 py-1 rounded-md border cursor-pointer transition-colors bg-transparent ${
                              hasShortage ? "text-red-400 border-red-500/30 hover:bg-red-500/10"
                                : mats.length > 0 ? "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                : "text-gray-500 border-border hover:bg-surface-hover"}`}>
                            {mats.length > 0 ? `${mats.length} item${mats.length !== 1 ? "s" : ""}${hasShortage ? " ⚠" : " ✓"}` : "+ Add"}
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditOrder(order)}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteOrder(order)} className="!text-red-400">Del</Button>
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

          <Modal open={addOrderModal} onClose={() => setAddOrderModal(false)} title="New Production Order" className="w-[640px]">
            {renderOrderForm(orderForm, setOrderForm)}
            <div className="flex justify-end gap-2.5 mt-6">
              <Button variant="secondary" onClick={() => setAddOrderModal(false)}>Cancel</Button>
              <Button onClick={handleAddOrder}>Create Order</Button>
            </div>
          </Modal>

          <Modal open={editOrderModal} onClose={() => { setEditOrderModal(false); setSelectedOrder(null); }} title="Edit Production Order" className="w-[640px]">
            {renderOrderForm(orderForm, setOrderForm)}
            <div className="flex justify-end gap-2.5 mt-6">
              <Button variant="secondary" onClick={() => { setEditOrderModal(false); setSelectedOrder(null); }}>Cancel</Button>
              <Button onClick={handleEditOrder}>Save Changes</Button>
            </div>
          </Modal>

          <Modal open={materialsModal} onClose={() => { setMaterialsModal(false); setSelectedOrder(null); }}
            title={`Required Materials — ${selectedOrder?.order_name || ""}`} className="w-[680px]">
            {selectedOrder && <>
              <p className="text-[12px] text-gray-500 mb-4">
                Quantities below are per-unit. With order qty of <span className="text-gray-300 font-semibold">{selectedOrder.quantity}</span>, total needed is shown.
              </p>
              {materials.length > 0 ? (
                <div className="bg-[#0B0F19] border border-border rounded-xl overflow-hidden mb-4">
                  <table className="w-full border-collapse">
                    <thead><tr className="border-b border-border">
                      <th className="px-3 py-2.5 text-left text-[11px] text-gray-500 uppercase tracking-wide">Product</th>
                      <th className="px-3 py-2.5 text-center text-[11px] text-gray-500 uppercase tracking-wide">Per Unit</th>
                      <th className="px-3 py-2.5 text-center text-[11px] text-gray-500 uppercase tracking-wide">Total Needed</th>
                      <th className="px-3 py-2.5 text-center text-[11px] text-gray-500 uppercase tracking-wide">In Stock</th>
                      <th className="px-3 py-2.5 text-center text-[11px] text-gray-500 uppercase tracking-wide">Status</th>
                      <th />
                    </tr></thead>
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
                            <td className="px-3 py-2.5 text-center text-[13px] font-semibold" style={{ color: shortage ? "#f87171" : "#34d399" }}>{stock}</td>
                            <td className="px-3 py-2.5 text-center">
                              {shortage ? <Badge color="red">Short {totalNeeded - stock}</Badge> : <Badge color="green">OK</Badge>}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button onClick={() => handleRemoveMaterial(mat.id)} className="text-[12px] text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer">✕</button>
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
              <div className="bg-[#0B0F19] border border-border rounded-xl p-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold mb-3">Add Material</div>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Select label="Product" value={newMatProductId} onChange={(e) => setNewMatProductId(e.target.value)}
                      options={productOptions.filter((o) => !o.value || !materials.some((m) => m.product_id === o.value))} />
                  </div>
                  <div className="w-28">
                    <Input label="Qty / unit" type="number" min="0.001" step="any" value={newMatQty} onChange={(e) => setNewMatQty(e.target.value)} />
                  </div>
                  <Button onClick={handleAddMaterial} disabled={matSaving || !newMatProductId}>{matSaving ? "Adding..." : "+ Add"}</Button>
                </div>
              </div>
              <div className="flex justify-end mt-5">
                <Button variant="secondary" onClick={() => { setMaterialsModal(false); setSelectedOrder(null); }}>Close</Button>
              </div>
            </>}
          </Modal>

          <Modal open={autoPOModal} onClose={() => setAutoPOModal(false)} title="Auto-Generate Purchase Order — Material Shortages" className="w-[680px]">
            <p className="text-[13px] text-gray-400 mb-5">Materials short across all active production orders.</p>
            {shortages.length > 0 ? (
              <div className="bg-[#0B0F19] border border-border rounded-xl overflow-hidden mb-5">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[11px] text-gray-500 uppercase tracking-wide">Product</th>
                    <th className="px-4 py-3 text-center text-[11px] text-gray-500 uppercase tracking-wide">In Stock</th>
                    <th className="px-4 py-3 text-center text-[11px] text-gray-500 uppercase tracking-wide">Total Needed</th>
                    <th className="px-4 py-3 text-center text-[11px] text-gray-500 uppercase tracking-wide">Order Qty</th>
                  </tr></thead>
                  <tbody>
                    {shortages.map(({ product, needed, stock }) => (
                      <tr key={product.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="text-[13px] text-gray-200 font-medium">{product.name}</div>
                          <div className="text-[11px] text-gray-500 font-mono">{product.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-[13px] text-red-400 font-semibold">{stock}</td>
                        <td className="px-4 py-3 text-center text-[13px] text-gray-300">{needed}</td>
                        <td className="px-4 py-3 text-center"><span className="text-[13px] font-bold text-amber-400">{needed - stock}</span></td>
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
                <Button onClick={() => { setAutoPOModal(false); window.location.href = "/purchase-orders"; }}>Go to Purchase Orders →</Button>
              </div>
            </div>
          </Modal>

        </>}

        {/* ════════════════════════════════════════════════════════════════
            TAB 2 — PARTS TO ORDER
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "parts" && <>

          {/* Summary bar */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Total Parts</div>
                <div className="text-[18px] font-bold text-gray-100">{totalParts}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Ordered</div>
                <div className="text-[18px] font-bold text-emerald-400">{orderedParts}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Received</div>
                <div className="text-[18px] font-bold text-emerald-400">{receivedParts}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Outstanding</div>
                <div className="text-[18px] font-bold text-amber-400">{outstandingParts}</div>
              </div>
            </div>
            <Button onClick={() => { setPartForm(emptyPartForm); setAddPartModal(true); }}>+ Add Part</Button>
          </div>

          {parts.length > 0 ? (
            <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Part Name</th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Qty Needed</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Production Order</th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Ordered?</th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Received?</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">PO #</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part) => {
                    const rowBg = part.is_received
                      ? "bg-emerald-500/5"
                      : part.is_ordered
                      ? "bg-amber-500/5"
                      : "";
                    return (
                      <tr key={part.id} className={`border-b border-border hover:bg-surface-hover transition-colors ${rowBg}`}>
                        <td className="px-4 py-3.5">
                          <div className="text-[13px] text-gray-100 font-medium">{part.part_name}</div>
                          {part.products && (
                            <div className="text-[11px] text-gray-500 font-mono">{part.products.sku} · stock: {part.products.stock}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center text-[13px] text-gray-300 font-mono">{part.qty_needed}</td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-400">{part.production_orders?.order_name || "—"}</td>
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={part.is_ordered}
                            onChange={() => handleTogglePart(part, "is_ordered")}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer"
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
                        <td className="px-4 py-3.5 text-[13px] text-gray-400 font-mono">{part.po_number || "—"}</td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-500 max-w-[180px] truncate">{part.notes || "—"}</td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditPart(part)}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeletePart(part)} className="!text-red-400">Del</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="📦" title="No parts to order" sub="Add parts you need to order for production" />
          )}

          <Modal open={addPartModal} onClose={() => setAddPartModal(false)} title="Add Part to Order" className="w-[560px]">
            {renderPartForm(partForm, setPartForm)}
            <div className="flex justify-end gap-2.5 mt-6">
              <Button variant="secondary" onClick={() => setAddPartModal(false)}>Cancel</Button>
              <Button onClick={handleAddPart}>Add Part</Button>
            </div>
          </Modal>

          <Modal open={editPartModal} onClose={() => { setEditPartModal(false); setSelectedPart(null); }} title="Edit Part" className="w-[560px]">
            {renderPartForm(partForm, setPartForm)}
            <div className="flex justify-end gap-2.5 mt-6">
              <Button variant="secondary" onClick={() => { setEditPartModal(false); setSelectedPart(null); }}>Cancel</Button>
              <Button onClick={handleEditPart}>Save Changes</Button>
            </div>
          </Modal>

        </>}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3 — INVOICES
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "invoices" && <>

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Total Invoices</div>
                <div className="text-[18px] font-bold text-gray-100">{invoices.length}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Total Amount</div>
                <div className="text-[18px] font-bold text-gray-100">
                  {formatCurrency(invoices.reduce((s, i) => s + (i.amount || 0), 0))}
                </div>
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={parseLoading}
              >
                {parseLoading ? "Parsing PDF..." : "+ Upload Invoice"}
              </Button>
            </div>
          </div>

          {invoices.length > 0 ? (
            <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Vendor</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Invoice #</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Production Order</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">File</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3.5 text-[13px] text-gray-100 font-medium">{inv.vendor_name}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-400 font-mono">{inv.invoice_number || "—"}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-100 font-bold text-right">{formatCurrency(inv.amount || 0)}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-400 whitespace-nowrap">{fmtDate(inv.date)}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-400">{inv.production_orders?.order_name || "—"}</td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-500 max-w-[140px] truncate">
                        {inv.file_name ? (
                          <span className="text-[#6366F1] cursor-pointer hover:underline" title={inv.file_name}>
                            {inv.file_name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-gray-500 max-w-[160px] truncate">{inv.notes || "—"}</td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditInvoice(inv)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteInvoice(inv)} className="!text-red-400">Del</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="🧾" title="No invoices yet" sub="Upload a PDF invoice to get started — Claude will extract the details automatically" />
          )}

          {/* Parse confirmation modal */}
          <Modal open={parseConfirmModal} onClose={() => setParseConfirmModal(false)}
            title="Confirm Extracted Invoice Data" className="w-[640px]">
            <p className="text-[12px] text-gray-500 mb-5">
              Claude extracted the following from <span className="text-gray-300">{parsedFileName}</span>. Review and edit before saving.
            </p>
            {renderInvoiceForm(invoiceForm, setInvoiceForm)}
            {parsedLineItems.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold mb-2">Extracted Line Items</div>
                <div className="bg-[#0B0F19] border border-border rounded-xl overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead><tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-[11px] text-gray-500 uppercase">Description</th>
                      <th className="px-3 py-2 text-center text-[11px] text-gray-500 uppercase">Qty</th>
                      <th className="px-3 py-2 text-right text-[11px] text-gray-500 uppercase">Unit Price</th>
                      <th className="px-3 py-2 text-right text-[11px] text-gray-500 uppercase">Total</th>
                    </tr></thead>
                    <tbody>
                      {parsedLineItems.map((li, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-[13px] text-gray-300">{li.description}</td>
                          <td className="px-3 py-2 text-center text-[13px] text-gray-400">{li.quantity}</td>
                          <td className="px-3 py-2 text-right text-[13px] text-gray-400">{formatCurrency(li.unit_price || 0)}</td>
                          <td className="px-3 py-2 text-right text-[13px] text-gray-300 font-medium">{formatCurrency(li.total || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2.5 mt-6">
              <Button variant="secondary" onClick={() => setParseConfirmModal(false)}>Cancel</Button>
              <Button onClick={handleSaveInvoice}>Save Invoice</Button>
            </div>
          </Modal>

          {/* Edit invoice modal */}
          <Modal open={editInvoiceModal} onClose={() => { setEditInvoiceModal(false); setSelectedInvoice(null); }} title="Edit Invoice" className="w-[560px]">
            {renderInvoiceForm(invoiceForm, setInvoiceForm)}
            <div className="flex justify-end gap-2.5 mt-6">
              <Button variant="secondary" onClick={() => { setEditInvoiceModal(false); setSelectedInvoice(null); }}>Cancel</Button>
              <Button onClick={handleEditInvoice}>Save Changes</Button>
            </div>
          </Modal>

        </>}

        {/* ════════════════════════════════════════════════════════════════
            TAB 4 — MILESTONES
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "milestones" && (() => {
          const today = new Date(); today.setHours(0,0,0,0);
          const totalM = milestones.length;
          const completeM = milestones.filter((m) => m.status === "complete").length;
          const inProgressM = milestones.filter((m) => m.status === "in_progress").length;
          const blockedM = milestones.filter((m) => m.status === "blocked").length;
          const overdueM = milestones.filter((m) => m.status !== "complete" && m.due_date && new Date(m.due_date + "T00:00:00") < today).length;

          // Group milestones by production_order_id
          const grouped = new Map<string, Milestone[]>();
          for (const m of milestones) {
            const key = m.production_order_id;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(m);
          }
          // Build order info map from orders
          const orderMap = new Map(orders.map((o) => [o.id, o]));

          // Init expanded state for any new orders
          for (const orderId of grouped.keys()) {
            if (expandedOrders[orderId] === undefined) {
              expandedOrders[orderId] = true;
            }
          }

          return <>
            {/* Summary bar */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-6">
                <div><div className="text-[11px] text-gray-500 uppercase tracking-wide">Total</div><div className="text-[18px] font-bold text-gray-100">{totalM}</div></div>
                <div><div className="text-[11px] text-gray-500 uppercase tracking-wide">Complete</div><div className="text-[18px] font-bold text-emerald-400">{completeM}</div></div>
                <div><div className="text-[11px] text-gray-500 uppercase tracking-wide">In Progress</div><div className="text-[18px] font-bold text-blue-400">{inProgressM}</div></div>
                <div><div className="text-[11px] text-gray-500 uppercase tracking-wide">Blocked</div><div className="text-[18px] font-bold text-red-400">{blockedM}</div></div>
                <div><div className="text-[11px] text-gray-500 uppercase tracking-wide">Overdue</div><div className={`text-[18px] font-bold ${overdueM > 0 ? "text-amber-400" : "text-gray-500"}`}>{overdueM}</div></div>
              </div>
            </div>

            {grouped.size === 0 ? (
              <EmptyState icon="🏁" title="No milestones yet" sub="Add milestones to your production orders to start tracking progress" />
            ) : (
              <div className="flex flex-col gap-4">
                {Array.from(grouped.entries()).map(([orderId, orderMilestones]) => {
                  const order = orderMap.get(orderId);
                  const days = order ? daysFromNow(order.delivery_date) : null;
                  const isExpanded = expandedOrders[orderId] !== false;
                  const orderComplete = orderMilestones.filter((m) => m.status === "complete").length;

                  return (
                    <div key={orderId} className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
                      {/* Order header */}
                      <div
                        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-surface-hover transition-colors border-b border-border"
                        onClick={() => toggleOrderExpanded(orderId)}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-[11px] text-gray-500">{isExpanded ? "▼" : "▶"}</span>
                          <div>
                            <span className="text-[14px] font-semibold text-gray-100">{order?.order_name || "Unknown Order"}</span>
                            {order?.customers?.name && (
                              <span className="ml-3 text-[12px] text-gray-500">{order.customers.name}</span>
                            )}
                          </div>
                          {order?.delivery_date && (
                            <span className="text-[12px] text-gray-500">
                              Delivery: {fmtDate(order.delivery_date)}
                              {days !== null && (
                                <span className={`ml-2 font-semibold ${days < 0 ? "text-red-400" : days <= 7 ? "text-amber-400" : "text-gray-400"}`}>
                                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d remaining`}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[12px] text-gray-500">{orderComplete}/{orderMilestones.length} complete</span>
                          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openAddMilestone(orderId); }}>+ Add</Button>
                        </div>
                      </div>

                      {/* Milestone rows */}
                      {isExpanded && (
                        <div>
                          {orderMilestones.map((m) => {
                            const mDays = daysFromNow(m.due_date);
                            const isOverdue = m.status !== "complete" && mDays !== null && mDays < 0;
                            return (
                              <div key={m.id} className={`flex items-center gap-4 px-5 py-3 border-b border-border last:border-0 hover:bg-surface-hover transition-colors ${isOverdue ? "bg-red-500/5" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={m.status === "complete"}
                                  onChange={() => handleToggleMilestone(m)}
                                  className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className={`text-[13px] font-medium ${m.status === "complete" ? "line-through text-gray-500" : "text-gray-100"}`}>{m.name}</span>
                                  {m.assigned_to && <span className="ml-3 text-[12px] text-gray-500">↳ {m.assigned_to}</span>}
                                </div>
                                {m.due_date && (
                                  <span className={`text-[12px] whitespace-nowrap ${isOverdue ? "text-red-400 font-semibold" : "text-gray-500"}`}>
                                    {fmtDate(m.due_date)}
                                    {mDays !== null && m.status !== "complete" && (
                                      <span className="ml-1">
                                        {mDays < 0 ? `(${Math.abs(mDays)}d overdue)` : mDays === 0 ? "(today)" : mDays <= 7 ? `(${mDays}d)` : ""}
                                      </span>
                                    )}
                                  </span>
                                )}
                                <Badge color={milestoneStatusColor(m.status)}>
                                  {m.status.replace("_", " ")}
                                </Badge>
                                <div className="flex gap-1 shrink-0">
                                  <Button size="sm" variant="ghost" onClick={() => openEditMilestone(m)}>Edit</Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDeleteMilestone(m)} className="!text-red-400">Del</Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Milestone Modal */}
            <Modal open={addMilestoneModal} onClose={() => { setAddMilestoneModal(false); setAddMilestoneOrderId(null); }} title="Add Milestone" className="w-[500px]">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Input label="Milestone Name" value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} placeholder="e.g. Firmware complete" /></div>
                <Input label="Assigned To" value={milestoneForm.assigned_to} onChange={(e) => setMilestoneForm({ ...milestoneForm, assigned_to: e.target.value })} placeholder="Person or team..." />
                <Input label="Due Date" type="date" value={milestoneForm.due_date} onChange={(e) => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })} />
                <Select label="Status" value={milestoneForm.status} onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value as MilestoneStatus })} options={MILESTONE_STATUS_OPTIONS} />
                <div />
                <div className="col-span-2"><Textarea label="Notes" value={milestoneForm.notes} onChange={(e) => setMilestoneForm({ ...milestoneForm, notes: e.target.value })} placeholder="Additional notes..." /></div>
              </div>
              <div className="flex justify-end gap-2.5 mt-6">
                <Button variant="secondary" onClick={() => { setAddMilestoneModal(false); setAddMilestoneOrderId(null); }}>Cancel</Button>
                <Button onClick={handleAddMilestone}>Add Milestone</Button>
              </div>
            </Modal>

            {/* Edit Milestone Modal */}
            <Modal open={editMilestoneModal} onClose={() => { setEditMilestoneModal(false); setSelectedMilestone(null); }} title="Edit Milestone" className="w-[500px]">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Input label="Milestone Name" value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} placeholder="e.g. Firmware complete" /></div>
                <Input label="Assigned To" value={milestoneForm.assigned_to} onChange={(e) => setMilestoneForm({ ...milestoneForm, assigned_to: e.target.value })} placeholder="Person or team..." />
                <Input label="Due Date" type="date" value={milestoneForm.due_date} onChange={(e) => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })} />
                <Select label="Status" value={milestoneForm.status} onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value as MilestoneStatus })} options={MILESTONE_STATUS_OPTIONS} />
                <div />
                <div className="col-span-2"><Textarea label="Notes" value={milestoneForm.notes} onChange={(e) => setMilestoneForm({ ...milestoneForm, notes: e.target.value })} placeholder="Additional notes..." /></div>
              </div>
              <div className="flex justify-end gap-2.5 mt-6">
                <Button variant="secondary" onClick={() => { setEditMilestoneModal(false); setSelectedMilestone(null); }}>Cancel</Button>
                <Button onClick={handleEditMilestone}>Save Changes</Button>
              </div>
            </Modal>
          </>;
        })()}

      </main>
    </>
  );
}
