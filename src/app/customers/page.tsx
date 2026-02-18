"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getProducts, createProduct, getSalesOrders, getNextSONumber, createSalesOrder,
  markSalesOrderSold, deleteSalesOrder, getPurchaseOrders, getPurchaseOrder,
} from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

// --- COMBOBOX (searchable dropdown with create) ---
function ComboBox({ label, value, onChange, options, onCreateNew, placeholder, createLabel }: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  onCreateNew?: (name: string) => Promise<string>;
  placeholder?: string;
  createLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;
  const exactMatch = options.some((o) => o.label.toLowerCase() === search.toLowerCase());
  const showCreate = onCreateNew && search.trim() && !exactMatch;

  // Reset search when value changes externally (e.g. PO import)
  useEffect(() => {
    if (!open) setSearch("");
  }, [value, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCreate = async () => {
    if (!onCreateNew || !search.trim() || creating) return;
    setCreating(true);
    try {
      const newId = await onCreateNew(search.trim());
      onChange(newId);
      setSearch("");
      setOpen(false);
    } catch (err: any) { toast.error(err.message || "Failed to create"); }
    finally { setCreating(false); }
  };

  return (
    <div ref={ref} className="relative">
      {label && <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">{label}</label>}
      <input
        type="text"
        value={open ? search : (current?.label || "")}
        onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setSearch(current?.label || ""); }}
        placeholder={placeholder || "Search..."}
        className="w-full bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-surface-card border border-border rounded-lg shadow-xl max-h-[240px] overflow-y-auto">
          {filtered.slice(0, 50).map((opt) => (
            <div key={opt.value}
              onClick={() => { onChange(opt.value); setSearch(""); setOpen(false); }}
              className={`px-3 py-2 text-[13px] cursor-pointer hover:bg-surface-hover transition-colors ${
                opt.value === value ? "text-brand font-medium" : "text-gray-300"}`}>
              {opt.label}
            </div>
          ))}
          {filtered.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-[12px] text-gray-500">No matches</div>
          )}
          {showCreate && (
            <div onClick={handleCreate}
              className="px-3 py-2 text-[13px] cursor-pointer hover:bg-brand/10 text-brand border-t border-border font-medium">
              {creating ? "Creating..." : `+ ${createLabel || "Create"} "${search.trim()}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- MAIN PAGE ---
const emptyCustomerForm = { name: "", email: "", phone: "", address: "", notes: "" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"customers" | "sales">("customers");
  const [search, setSearch] = useState("");

  // Customer modals
  const [addCustModal, setAddCustModal] = useState(false);
  const [editCustModal, setEditCustModal] = useState(false);
  const [editingCust, setEditingCust] = useState<any>(null);
  const [custForm, setCustForm] = useState(emptyCustomerForm);

  // Sales order modal
  const [soModal, setSoModal] = useState(false);
  const [soNumber, setSoNumber] = useState("");
  const [soCustomerId, setSoCustomerId] = useState("");
  const [soNotes, setSoNotes] = useState("");
  const [soLines, setSoLines] = useState<{ productId: string; productName: string; qty: string; unitCost: string; poNumber: string }[]>([]);

  // PO import modal
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [soFilterCustomer, setSoFilterCustomer] = useState("");
  const [poPickerSearch, setPoPickerSearch] = useState("");
  const [poDetail, setPoDetail] = useState<any>(null);
  const [poDetailLoading, setPoDetailLoading] = useState(false);
  const [poSelectedItems, setPoSelectedItems] = useState<Set<string>>(new Set());

  const loadAll = async () => {
    try {
      const [cust, prods, orders, pos] = await Promise.all([
        getCustomers(), getProducts(), getSalesOrders(), getPurchaseOrders(),
      ]);
      setCustomers(cust);
      setProducts(prods);
      setSalesOrders(orders);
      setPurchaseOrders(pos);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const lowStockCount = products.filter((p: any) => p.stock <= p.reorder_point).length;

  const productOptions = useMemo(() =>
    products.map((p: any) => ({ value: p.id, label: p.name + " | " + p.sku + " (" + p.stock + " in stock)" })),
    [products]
  );

  const customerOptions = useMemo(() =>
    customers.map((c: any) => ({ value: c.id, label: c.name })),
    [customers]
  );

  // --- PRODUCT CREATE ---
  const handleCreateProduct = async (name: string): Promise<string> => {
    const autoSku = "NEW-" + Date.now().toString(36).toUpperCase();
    const newProd = await createProduct({
      name, sku: autoSku, category: "General", unit: "pcs",
      stock: 0, cost: 0, price: 0, reorder_point: 0, image: "", is_active: true,
    } as any);
    setProducts((prev) => [...prev, newProd].sort((a: any, b: any) => a.name.localeCompare(b.name)));
    toast.success("Product created");
    return newProd.id;
  };

  // --- CUSTOMERS ---
  const displayedCustomers = customers.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleAddCustomer = async () => {
    if (!custForm.name) return toast.error("Customer name is required");
    try {
      await createCustomer(custForm);
      toast.success("Customer added");
      setAddCustModal(false);
      setCustForm(emptyCustomerForm);
      loadAll();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const openEditCust = (c: any) => {
    setEditingCust(c);
    setCustForm({ name: c.name, email: c.email || "", phone: c.phone || "", address: c.address || "", notes: c.notes || "" });
    setEditCustModal(true);
  };

  const handleEditCustomer = async () => {
    if (!editingCust || !custForm.name) return toast.error("Name required");
    try {
      await updateCustomer(editingCust.id, custForm);
      toast.success("Updated"); setEditCustModal(false); setEditingCust(null); loadAll();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleDeleteCustomer = async (c: any) => {
    if (!confirm("Remove \"" + c.name + "\"?")) return;
    try { await deleteCustomer(c.id); toast.success("Removed"); loadAll(); }
    catch { toast.error("Failed"); }
  };

  const orderCountByCustomer = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const so of salesOrders) counts[so.customer_id] = (counts[so.customer_id] || 0) + 1;
    return counts;
  }, [salesOrders]);

  // --- SALES ORDERS ---
  const displayedOrders = salesOrders.filter((so: any) =>
    !search || so.order_number.toLowerCase().includes(search.toLowerCase()) ||
    (so.customer?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreateSO = async () => {
    const num = await getNextSONumber();
    setSoNumber(num);
    setSoCustomerId(customers[0]?.id || "");
    setSoNotes("");
    setSoLines([{ productId: "", productName: "", qty: "1", unitCost: "0", poNumber: "" }]);
    setSoModal(true);
  };

  const addSOLine = () => {
    setSoLines([...soLines, { productId: "", productName: "", qty: "1", unitCost: "0", poNumber: "" }]);
  };

  const removeSOLine = (idx: number) => {
    if (soLines.length <= 1) return;
    setSoLines(soLines.filter((_, i) => i !== idx));
  };

  const updateSOLine = (idx: number, field: string, value: string) => {
    const updated = [...soLines];
    (updated[idx] as any)[field] = value;
    if (field === "productId") {
      const prod = products.find((p: any) => p.id === value);
      if (prod) {
        updated[idx].unitCost = String(prod.cost || 0);
        updated[idx].productName = prod.name;
      }
    }
    setSoLines(updated);
  };

  const soTotal = soLines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0), 0);

  // --- PO IMPORT ---
  const filteredPOs = purchaseOrders.filter((po: any) =>
    !poPickerSearch || po.po_number.toLowerCase().includes(poPickerSearch.toLowerCase()) ||
    (po.supplier?.name || "").toLowerCase().includes(poPickerSearch.toLowerCase())
  );

  const openPOPicker = () => {
    setPoPickerSearch("");
    setPoDetail(null);
    setPoSelectedItems(new Set());
    setPoPickerOpen(true);
  };

  const loadPODetail = async (poId: string) => {
    setPoDetailLoading(true);
    try {
      const full = await getPurchaseOrder(poId);
      setPoDetail(full);
      // Select all by default
      const allIds = new Set((full.line_items || []).map((li: any) => li.id));
      setPoSelectedItems(allIds);
    } catch { toast.error("Failed to load PO"); }
    finally { setPoDetailLoading(false); }
  };

  const togglePOItem = (id: string) => {
    const next = new Set(poSelectedItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPoSelectedItems(next);
  };

  const selectAllPOItems = () => {
    if (!poDetail) return;
    const allIds = new Set((poDetail.line_items || []).map((li: any) => li.id));
    setPoSelectedItems(allIds);
  };

  const selectNonePOItems = () => { setPoSelectedItems(new Set()); };

  const importPOItems = () => {
    if (!poDetail || poSelectedItems.size === 0) return toast.error("Select at least one item");
    const newLines = (poDetail.line_items || [])
      .filter((li: any) => poSelectedItems.has(li.id))
      .map((li: any) => ({
        productId: li.product_id || li.product?.id || "",
        productName: li.product?.name || "",
        qty: String(li.quantity || 0),
        unitCost: String(li.unit_cost || 0),
        poNumber: poDetail.po_number,
      }))
      .filter((l: any) => l.productId);

    // Remove empty first line if it exists
    let current = [...soLines];
    if (current.length === 1 && !current[0].productId) current = [];
    setSoLines([...current, ...newLines]);
    setPoPickerOpen(false);
    setPoDetail(null);
    toast.success(newLines.length + " items imported from " + poDetail.po_number);
  };

  const handleCreateSO = async () => {
    if (!soCustomerId) return toast.error("Select a customer");
    const validLines = soLines.filter((l) => l.productId);
    if (validLines.length === 0) return toast.error("Add at least one product");
    try {
      await createSalesOrder(
        { customer_id: soCustomerId, order_number: soNumber, notes: soNotes },
        validLines.map((l) => ({
          product_id: l.productId,
          quantity: parseInt(l.qty) || 1,
          unit_cost: parseFloat(l.unitCost) || 0,
        }))
      );
      toast.success("Sales order created");
      setSoModal(false);
      loadAll();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleMarkSold = async (so: any) => {
    if (!confirm("Mark \"" + so.order_number + "\" as sold? This deducts inventory.")) return;
    try {
      await markSalesOrderSold(so.id);
      toast.success("Sold - inventory deducted");
      loadAll();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleDeleteSO = async (so: any) => {
    if (so.status === "sold") return toast.error("Cannot delete sold order");
    if (!confirm("Delete \"" + so.order_number + "\"?")) return;
    try { await deleteSalesOrder(so.id); toast.success("Deleted"); loadAll(); }
    catch { toast.error("Failed"); }
  };

  const renderCustForm = () => (
    <div className="grid grid-cols-2 gap-4">
      <Input label="Customer Name" value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} />
      <Input label="Email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} />
      <Input label="Phone" value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} />
      <Input label="Address" value={custForm.address} onChange={(e) => setCustForm({ ...custForm, address: e.target.value })} />
      <div className="col-span-2">
        <Input label="Notes" value={custForm.notes} onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })} />
      </div>
    </div>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        {/* Tabs */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-2">
            {(["customers", "sales"] as const).map((t) => (
              <button key={t} onClick={() => { setActiveTab(t); setSearch(""); }}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all cursor-pointer ${
                  activeTab === t ? "bg-brand/20 border-brand text-brand" : "bg-surface-card border-border text-gray-400 hover:border-border-light"}`}>
                {t === "customers" ? "Customers (" + customers.length + ")" : "Sales Orders (" + salesOrders.length + ")"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {activeTab === "customers" && <Button onClick={() => { setCustForm(emptyCustomerForm); setAddCustModal(true); }}>+ Add Customer</Button>}
            {activeTab === "sales" && <Button onClick={openCreateSO}>+ New Sales Order</Button>}
          </div>
        </div>

        {/* Search */}
        <div className="mb-5">
          <input type="text" placeholder={activeTab === "customers" ? "Search customers..." : "Search orders..."}
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand" />
        </div>

        {/* CUSTOMERS TAB */}
        {activeTab === "customers" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedCustomers.map((c) => (
              <div key={c.id} className="bg-surface-card border border-border rounded-[14px] p-6 hover:border-border-light transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="font-bold text-base text-gray-100">{c.name}</div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEditCust(c)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteCustomer(c)} className="!text-red-400">Del</Button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mb-3 text-[13px] text-gray-400">
                  {c.email && <div>Email: {c.email}</div>}
                  {c.phone && <div>Phone: {c.phone}</div>}
                  {c.address && <div>Addr: {c.address}</div>}
                </div>
                <Badge>{orderCountByCustomer[c.id] || 0} order{(orderCountByCustomer[c.id] || 0) !== 1 ? "s" : ""}</Badge>
                {c.notes && <div className="text-[11px] text-gray-500 mt-3 italic">{c.notes}</div>}
              </div>
            ))}
            {displayedCustomers.length === 0 && <EmptyState icon="C" title="No customers" sub="Add your first customer" />}
          </div>
        )}

        {/* SALES ORDERS TAB */}
        {activeTab === "sales" && (() => {
          // Filter by selected customer
          const custFiltered = soFilterCustomer
            ? displayedOrders.filter((so: any) => so.customer_id === soFilterCustomer)
            : displayedOrders;

          // Group by customer
          const byCustomer: Record<string, { name: string; orders: any[] }> = {};
          for (const so of custFiltered) {
            const custId = so.customer_id || "none";
            const custName = so.customer?.name || "No Customer";
            if (!byCustomer[custId]) byCustomer[custId] = { name: custName, orders: [] };
            byCustomer[custId].orders.push(so);
          }

          // Within each customer, group by order_number (invoice)
          const customerGroups = Object.entries(byCustomer).sort((a, b) => a[1].name.localeCompare(b[1].name));

          return (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex gap-3 items-center">
                <select value={soFilterCustomer} onChange={(e) => setSoFilterCustomer(e.target.value)}
                  className="bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:border-brand">
                  <option value="">All Customers</option>
                  {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="text-[12px] text-gray-500">{custFiltered.length} order{custFiltered.length !== 1 ? "s" : ""}</span>
              </div>

              {customerGroups.map(([custId, group]) => {
                // Group orders by invoice number within this customer
                const byInvoice: Record<string, any[]> = {};
                for (const so of group.orders) {
                  const inv = so.order_number || "No Invoice";
                  if (!byInvoice[inv]) byInvoice[inv] = [];
                  byInvoice[inv].push(so);
                }

                return (
                  <div key={custId} className="space-y-3">
                    {/* Customer header */}
                    <div className="flex items-center gap-2 pt-2">
                      <div className="w-8 h-8 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[13px] font-bold">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[14px] font-semibold text-gray-100">{group.name}</span>
                      <span className="text-[12px] text-gray-500">({group.orders.length} order{group.orders.length !== 1 ? "s" : ""})</span>
                    </div>

                    {Object.entries(byInvoice).map(([invoiceNum, orders]) => (
                      <div key={invoiceNum} className="ml-10 space-y-2">
                        {orders.length > 1 && (
                          <div className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">{invoiceNum} ({orders.length} entries)</div>
                        )}
                        {orders.map((so: any) => (
                          <div key={so.id} className="bg-surface-card border border-border rounded-[14px] p-5">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <div className="flex items-center gap-2.5">
                                  <span className="font-bold text-[15px] text-gray-100">{so.order_number}</span>
                                  <Badge color={so.status === "sold" ? "green" : "blue"}>
                                    {so.status === "sold" ? "SOLD" : "DRAFT"}
                                  </Badge>
                                </div>
                                <div className="text-[12px] text-gray-500 mt-1">
                                  {new Date(so.created_at).toLocaleDateString()}
                                  {so.sold_date && " | Sold " + new Date(so.sold_date).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[16px] text-gray-100">{formatCurrency(so.total_amount || 0)}</span>
                                {so.status === "draft" && (
                                  <>
                                    <Button size="sm" onClick={() => handleMarkSold(so)}>Mark Sold</Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteSO(so)} className="!text-red-400">Del</Button>
                                  </>
                                )}
                              </div>
                            </div>
                            {so.line_items && so.line_items.length > 0 && (
                              <div className="mt-3 border-t border-border pt-3">
                                {so.line_items.map((li: any, idx: number) => (
                                  <div key={li.id || idx} className="flex justify-between items-center py-1.5 text-[13px]">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-200">{li.product?.name || "Unknown"}</span>
                                      {li.poNumber && (
                                        <span className="text-[11px] text-gray-500 bg-surface rounded px-1.5 py-0.5">{li.poNumber}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-400">
                                      <span>x{li.quantity}</span>
                                      <span>{formatCurrency(li.unit_cost)}</span>
                                      <span className="text-gray-200 font-medium">{formatCurrency(li.quantity * li.unit_cost)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {so.notes && <div className="text-[11px] text-gray-500 mt-2 italic">{so.notes}</div>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
              {custFiltered.length === 0 && <EmptyState icon="S" title="No sales orders" sub="Create your first sales order" />}
            </div>
          );
        })()}

        {/* ADD CUSTOMER */}
        <Modal open={addCustModal} onClose={() => setAddCustModal(false)} title="Add Customer">
          {renderCustForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setAddCustModal(false)}>Cancel</Button>
            <Button onClick={handleAddCustomer}>Add Customer</Button>
          </div>
        </Modal>

        {/* EDIT CUSTOMER */}
        <Modal open={editCustModal} onClose={() => { setEditCustModal(false); setEditingCust(null); }} title={"Edit " + (editingCust?.name || "Customer")}>
          {renderCustForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => { setEditCustModal(false); setEditingCust(null); }}>Cancel</Button>
            <Button onClick={handleEditCustomer}>Save Changes</Button>
          </div>
        </Modal>

        {/* CREATE SALES ORDER */}
        <Modal open={soModal} onClose={() => setSoModal(false)} title={"Create Sales Order - " + soNumber}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ComboBox label="Customer" value={soCustomerId} onChange={setSoCustomerId}
                options={customerOptions} placeholder="Search customers..." />
              <Input label="Order #" value={soNumber} onChange={(e) => setSoNumber(e.target.value)} />
            </div>

            {/* Line items header + Import button */}
            <div className="flex items-center justify-between">
              <div className="text-[12px] text-gray-400 font-medium uppercase tracking-wide">Line Items</div>
              <button onClick={openPOPicker}
                className="text-[12px] text-brand bg-brand/10 border border-brand/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-brand/20 transition-colors font-medium">
                Import from PO
              </button>
            </div>

            {soLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {line.productId && line.productName ? (
                    <div>
                      {idx === 0 && <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Product</label>}
                      <div className="flex items-center gap-1">
                        <div className="flex-1 bg-[#0B0F19] border border-border rounded-lg px-3 py-1.5 text-[13px] text-gray-100 truncate">
                          {line.productName}
                        </div>
                        <button onClick={() => { const updated = [...soLines]; updated[idx].productId = ""; updated[idx].productName = ""; setSoLines(updated); }}
                          className="text-[11px] text-gray-500 bg-transparent border-none cursor-pointer hover:text-gray-300 shrink-0">chg</button>
                      </div>
                    </div>
                  ) : (
                    <ComboBox label={idx === 0 ? "Product" : ""} value={line.productId}
                      onChange={(v) => updateSOLine(idx, "productId", v)}
                      options={productOptions}
                      onCreateNew={handleCreateProduct}
                      placeholder="Search product or type to create..."
                      createLabel="Create product" />
                  )}
                </div>
                <div className="col-span-2">
                  <Input label={idx === 0 ? "Qty" : ""} type="number" min="1" value={line.qty}
                    onChange={(e) => updateSOLine(idx, "qty", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Input label={idx === 0 ? "Unit Cost" : ""} type="number" step="0.01" value={line.unitCost}
                    onChange={(e) => updateSOLine(idx, "unitCost", e.target.value)} />
                </div>
                <div className="col-span-2 text-right text-[13px] text-gray-300 font-medium pb-1">
                  {formatCurrency((parseFloat(line.qty) || 0) * (parseFloat(line.unitCost) || 0))}
                  {line.poNumber && <div className="text-[10px] text-gray-500">{line.poNumber}</div>}
                </div>
                <div className="col-span-1 flex justify-center pb-1">
                  {soLines.length > 1 && (
                    <button onClick={() => removeSOLine(idx)}
                      className="text-red-400 text-sm bg-transparent border-none cursor-pointer hover:text-red-300">x</button>
                  )}
                </div>
              </div>
            ))}

            <button onClick={addSOLine}
              className="text-[12px] text-brand bg-transparent border border-brand/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-brand/10 transition-colors">
              + Add Line Item
            </button>

            <Input label="Notes" value={soNotes} onChange={(e) => setSoNotes(e.target.value)} />

            <div className="text-right text-[16px] font-bold text-brand">Total: {formatCurrency(soTotal)}</div>
          </div>
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setSoModal(false)}>Cancel</Button>
            <Button onClick={handleCreateSO}>Create Order</Button>
          </div>
        </Modal>

        {/* PO PICKER MODAL */}
        <Modal open={poPickerOpen} onClose={() => { setPoPickerOpen(false); setPoDetail(null); }}
          title={poDetail ? "Import from " + poDetail.po_number : "Select a Purchase Order"}>

          {!poDetail ? (
            <div className="space-y-3">
              <input type="text" placeholder="Search PO# or supplier..."
                value={poPickerSearch} onChange={(e) => setPoPickerSearch(e.target.value)}
                className="w-full bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand" />
              <div className="max-h-[400px] overflow-y-auto space-y-1">
                {filteredPOs.slice(0, 50).map((po: any) => (
                  <div key={po.id} onClick={() => loadPODetail(po.id)}
                    className="flex justify-between items-center px-4 py-3 rounded-lg cursor-pointer hover:bg-surface-hover transition-colors border border-border">
                    <div>
                      <div className="text-[13px] font-semibold text-gray-100">{po.po_number}</div>
                      <div className="text-[11px] text-gray-500">{po.supplier?.name || ""}</div>
                    </div>
                    <div className="text-[13px] text-gray-400">{formatCurrency(po.total_amount || 0)}</div>
                  </div>
                ))}
                {filteredPOs.length === 0 && <div className="text-center text-gray-500 text-[13px] py-6">No POs found</div>}
              </div>
            </div>
          ) : poDetailLoading ? (
            <div className="text-center py-8 text-gray-400">Loading PO details...</div>
          ) : (
            <div className="space-y-3">
              <div className="text-[12px] text-gray-400 mb-2">
                {poDetail.supplier?.name} | {(poDetail.line_items || []).length} items | {formatCurrency(poDetail.total_amount || 0)}
              </div>

              {/* Select all / none */}
              <div className="flex gap-2">
                <button onClick={selectAllPOItems}
                  className="text-[11px] text-brand bg-brand/10 border border-brand/30 rounded px-2 py-1 cursor-pointer hover:bg-brand/20">
                  Select All
                </button>
                <button onClick={selectNonePOItems}
                  className="text-[11px] text-gray-400 bg-transparent border border-border rounded px-2 py-1 cursor-pointer hover:border-border-light">
                  Select None
                </button>
                <button onClick={() => { setPoDetail(null); setPoSelectedItems(new Set()); }}
                  className="text-[11px] text-gray-400 bg-transparent border border-border rounded px-2 py-1 cursor-pointer hover:border-border-light">
                  Back to list
                </button>
              </div>

              {/* Line items with checkboxes */}
              <div className="max-h-[350px] overflow-y-auto space-y-1">
                {(poDetail.line_items || []).map((li: any) => (
                  <div key={li.id}
                    onClick={() => togglePOItem(li.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer border transition-colors ${
                      poSelectedItems.has(li.id) ? "border-brand bg-brand/5" : "border-border hover:bg-surface-hover"}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center text-[11px] font-bold ${
                      poSelectedItems.has(li.id) ? "border-brand bg-brand text-white" : "border-gray-600"}`}>
                      {poSelectedItems.has(li.id) ? "v" : ""}
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] text-gray-200">{li.product?.name || "Unknown"}</div>
                      <div className="text-[11px] text-gray-500">{li.product?.sku || ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] text-gray-300">x{li.quantity}</div>
                      <div className="text-[11px] text-gray-500">{formatCurrency(li.unit_cost)} ea</div>
                    </div>
                    <div className="text-[13px] font-medium text-gray-200 w-24 text-right">
                      {formatCurrency(li.quantity * li.unit_cost)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-border">
                <div className="text-[13px] text-gray-400">{poSelectedItems.size} items selected</div>
                <Button onClick={importPOItems} disabled={poSelectedItems.size === 0}>
                  Import {poSelectedItems.size} Item{poSelectedItems.size !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </main>
    </>
  );
}
