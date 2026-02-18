"use client";

import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getProducts, getSalesOrders, getNextSONumber, createSalesOrder,
  markSalesOrderSold, deleteSalesOrder, getPurchaseOrders,
} from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

const emptyCustomerForm = { name: "", email: "", phone: "", address: "", notes: "" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View
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
  const [soLines, setSoLines] = useState<{ productId: string; qty: string; unitCost: string; poId: string }[]>([]);

  // Detail modal
  const [detailOrder, setDetailOrder] = useState<any>(null);

  const loadAll = async () => {
    try {
      const [cust, prods, orders, pos] = await Promise.all([
        getCustomers(),
        getProducts(),
        getSalesOrders(),
        getPurchaseOrders(),
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
      toast.success("Customer updated");
      setEditCustModal(false);
      setEditingCust(null);
      loadAll();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleDeleteCustomer = async (c: any) => {
    if (!confirm("Deactivate \"" + c.name + "\"?")) return;
    try { await deleteCustomer(c.id); toast.success("Customer removed"); loadAll(); }
    catch { toast.error("Failed"); }
  };

  // Count orders per customer
  const orderCountByCustomer = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const so of salesOrders) {
      counts[so.customer_id] = (counts[so.customer_id] || 0) + 1;
    }
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
    setSoLines([{ productId: products[0]?.id || "", qty: "1", unitCost: String(products[0]?.cost || 0), poId: "" }]);
    setSoModal(true);
  };

  const addSOLine = () => {
    setSoLines([...soLines, { productId: products[0]?.id || "", qty: "1", unitCost: String(products[0]?.cost || 0), poId: "" }]);
  };

  const removeSOLine = (idx: number) => {
    if (soLines.length <= 1) return;
    setSoLines(soLines.filter((_, i) => i !== idx));
  };

  const updateSOLine = (idx: number, field: string, value: string) => {
    const updated = [...soLines];
    (updated[idx] as any)[field] = value;
    // Auto-fill unit cost when product changes
    if (field === "productId") {
      const prod = products.find((p: any) => p.id === value);
      if (prod) updated[idx].unitCost = String(prod.cost || 0);
    }
    setSoLines(updated);
  };

  const soTotal = soLines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0), 0);

  const handleCreateSO = async () => {
    if (!soCustomerId) return toast.error("Select a customer");
    if (soLines.some((l) => !l.productId)) return toast.error("Select products for all lines");
    try {
      await createSalesOrder(
        { customer_id: soCustomerId, order_number: soNumber, notes: soNotes },
        soLines.map((l) => ({
          product_id: l.productId,
          quantity: parseInt(l.qty) || 1,
          unit_cost: parseFloat(l.unitCost) || 0,
          purchase_order_id: l.poId || undefined,
        }))
      );
      toast.success("Sales order created");
      setSoModal(false);
      loadAll();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleMarkSold = async (so: any) => {
    if (!confirm("Mark \"" + so.order_number + "\" as sold? This will deduct inventory.")) return;
    try {
      await markSalesOrderSold(so.id);
      toast.success("Marked as sold - inventory deducted");
      loadAll();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleDeleteSO = async (so: any) => {
    if (so.status === "sold") return toast.error("Cannot delete a sold order");
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
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all cursor-pointer ${
                  activeTab === t ? "bg-brand/20 border-brand text-brand" : "bg-surface-card border-border text-gray-400 hover:border-border-light"}`}>
                {t === "customers" ? "Customers" : "Sales Orders"}
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
        {activeTab === "sales" && (
          <div className="space-y-3">
            {displayedOrders.map((so: any) => (
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
                      {so.customer?.name || "No customer"} | Created {new Date(so.created_at).toLocaleDateString()}
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
                {/* Line items */}
                {so.line_items && so.line_items.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    {so.line_items.map((li: any, idx: number) => (
                      <div key={li.id || idx} className="flex justify-between items-center py-1.5 text-[13px]">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-200">{li.product?.name || "Unknown"}</span>
                          {li.purchase_order?.po_number && (
                            <span className="text-[11px] text-gray-500 bg-surface rounded px-1.5 py-0.5">
                              {li.purchase_order.po_number}
                            </span>
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
            {displayedOrders.length === 0 && <EmptyState icon="S" title="No sales orders" sub="Create your first sales order" />}
          </div>
        )}

        {/* ADD CUSTOMER MODAL */}
        <Modal open={addCustModal} onClose={() => setAddCustModal(false)} title="Add Customer">
          {renderCustForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setAddCustModal(false)}>Cancel</Button>
            <Button onClick={handleAddCustomer}>Add Customer</Button>
          </div>
        </Modal>

        {/* EDIT CUSTOMER MODAL */}
        <Modal open={editCustModal} onClose={() => { setEditCustModal(false); setEditingCust(null); }} title={"Edit " + (editingCust?.name || "Customer")}>
          {renderCustForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => { setEditCustModal(false); setEditingCust(null); }}>Cancel</Button>
            <Button onClick={handleEditCustomer}>Save Changes</Button>
          </div>
        </Modal>

        {/* CREATE SALES ORDER MODAL */}
        <Modal open={soModal} onClose={() => setSoModal(false)} title={"Create Sales Order - " + soNumber}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Select label="Customer" value={soCustomerId} onChange={(e) => setSoCustomerId(e.target.value)}
                options={customers.map((c) => ({ value: c.id, label: c.name }))} />
              <Input label="Order #" value={soNumber} onChange={(e) => setSoNumber(e.target.value)} />
            </div>

            <div className="text-[12px] text-gray-400 font-medium uppercase tracking-wide">Line Items</div>
            {soLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <Select label={idx === 0 ? "Product" : ""} value={line.productId}
                    onChange={(e) => updateSOLine(idx, "productId", e.target.value)}
                    options={products.map((p: any) => ({ value: p.id, label: p.name + " (" + p.stock + " in stock)" }))} />
                </div>
                <div className="col-span-2">
                  <Input label={idx === 0 ? "Qty" : ""} type="number" min="1" value={line.qty}
                    onChange={(e) => updateSOLine(idx, "qty", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Input label={idx === 0 ? "Unit Cost" : ""} type="number" step="0.01" value={line.unitCost}
                    onChange={(e) => updateSOLine(idx, "unitCost", e.target.value)} />
                </div>
                <div className="col-span-3">
                  <Select label={idx === 0 ? "Linked PO (optional)" : ""} value={line.poId}
                    onChange={(e) => updateSOLine(idx, "poId", e.target.value)}
                    options={[{ value: "", label: "None" }, ...purchaseOrders.map((po: any) => ({ value: po.id, label: po.po_number }))]} />
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
      </main>
    </>
  );
}
