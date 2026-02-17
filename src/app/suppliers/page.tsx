"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getSuppliers, getProducts, getSupplierPOCounts, createSupplier, updateSupplier, deleteSupplier } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, EmptyState, LoadingSpinner } from "@/components/ui";
import type { Product, Supplier } from "@/types/database";

const emptyForm = { name: "", contact_email: "", phone: "", address: "", lead_time_days: "14", notes: "" };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [poCounts, setPOCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState<"all" | "short" | "medium" | "long">("all");
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingSup, setEditingSup] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const [supData, prodData, counts] = await Promise.all([getSuppliers(), getProducts(), getSupplierPOCounts()]);
      setSuppliers(supData);
      setProducts(prodData);
      setPOCounts(counts);
    } catch { toast.error("Failed to load suppliers"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const lowStockCount = products.filter((p) => p.stock <= p.reorder_point).length;

  let displayed = [...suppliers];
  if (search) {
    const q = search.toLowerCase();
    displayed = displayed.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.contact_email || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q)
    );
  }
  if (leadFilter === "short") displayed = displayed.filter((s) => s.lead_time_days <= 7);
  else if (leadFilter === "medium") displayed = displayed.filter((s) => s.lead_time_days > 7 && s.lead_time_days <= 30);
  else if (leadFilter === "long") displayed = displayed.filter((s) => s.lead_time_days > 30);

  const openAdd = () => { setForm(emptyForm); setAddModal(true); };
  const handleAdd = async () => {
    if (!form.name) return toast.error("Supplier name is required");
    try {
      await createSupplier({ name: form.name, contact_email: form.contact_email, phone: form.phone, address: form.address, lead_time_days: parseInt(form.lead_time_days) || 14, notes: form.notes });
      toast.success("Supplier added"); setAddModal(false); load();
    } catch (err: any) { toast.error(err.message || "Failed to add supplier"); }
  };

  const openEdit = (s: Supplier) => {
    setEditingSup(s);
    setForm({ name: s.name, contact_email: s.contact_email || "", phone: s.phone || "", address: s.address || "", lead_time_days: String(s.lead_time_days || 14), notes: s.notes || "" });
    setEditModal(true);
  };
  const handleEdit = async () => {
    if (!editingSup || !form.name) return toast.error("Supplier name is required");
    try {
      await updateSupplier(editingSup.id, { name: form.name, contact_email: form.contact_email, phone: form.phone, address: form.address, lead_time_days: parseInt(form.lead_time_days) || 14, notes: form.notes });
      toast.success("Supplier updated"); setEditModal(false); setEditingSup(null); load();
    } catch (err: any) { toast.error(err.message || "Failed to update supplier"); }
  };

  const handleDeactivate = async (s: Supplier) => {
    if (!confirm("Deactivate \"" + s.name + "\"?")) return;
    try { await deleteSupplier(s.id); toast.success("Supplier deactivated"); load(); }
    catch { toast.error("Failed to deactivate supplier"); }
  };

  const renderForm = () => (
    <div className="grid grid-cols-2 gap-4">
      <Input label="Company Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input label="Email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
      <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <Input label="Lead Time (days)" type="number" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} />
      <div className="col-span-2"><Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      <div className="col-span-2"><Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
    </div>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex justify-between items-center mb-5">
          <div className="text-[13px] text-gray-400">{displayed.length} supplier{displayed.length !== 1 ? "s" : ""}</div>
          <Button onClick={openAdd}>+ Add Supplier</Button>
        </div>

        <div className="flex gap-2.5 items-center mb-5">
          <input type="text" placeholder="Search name, email, phone..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-xs bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand" />
          {(["all", "short", "medium", "long"] as const).map((f) => (
            <button key={f} onClick={() => setLeadFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                leadFilter === f ? "bg-brand/20 border-brand text-brand" : "bg-surface-card border-border text-gray-400 hover:border-border-light"}`}>
              {f === "all" ? "All" : f === "short" ? "0-7d" : f === "medium" ? "8-30d" : "30d+"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((s) => {
            const poCount = poCounts[s.id] || 0;
            return (
              <div key={s.id} className="bg-surface-card border border-border rounded-[14px] p-6 hover:border-border-light transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="font-bold text-base text-gray-100">{s.name}</div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeactivate(s)} className="!text-red-400">Del</Button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mb-4 text-[13px] text-gray-400">
                  {s.contact_email && <div>Email: {s.contact_email}</div>}
                  {s.phone && <div>Phone: {s.phone}</div>}
                  {s.address && <div>Addr: {s.address}</div>}
                </div>
                <div className="flex gap-2.5 flex-wrap">
                  <Badge color="blue">{s.lead_time_days}d lead time</Badge>
                  <Badge>{poCount} PO{poCount !== 1 ? "s" : ""}</Badge>
                </div>
                {s.notes && <div className="text-[11px] text-gray-500 mt-3 italic">{s.notes}</div>}
              </div>
            );
          })}
        </div>
        {displayed.length === 0 && <EmptyState icon="V" title="No suppliers found" sub={search ? "Try a different search" : "Add your first supplier"} />}

        <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Supplier">
          {renderForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add Supplier</Button>
          </div>
        </Modal>

        <Modal open={editModal} onClose={() => { setEditModal(false); setEditingSup(null); }} title={"Edit " + (editingSup?.name || "Supplier")}>
          {renderForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => { setEditModal(false); setEditingSup(null); }}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </div>
        </Modal>
      </main>
    </>
  );
}
