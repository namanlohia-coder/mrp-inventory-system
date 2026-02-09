"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getSuppliers, getProducts, getPurchaseOrders, createSupplier } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, EmptyState, LoadingSpinner } from "@/components/ui";
import type { Product, Supplier, PurchaseOrder } from "@/types/database";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", contact_email: "", phone: "", address: "", lead_time_days: "14", notes: "" });

  const load = async () => {
    try {
      const [supData, prodData, poData] = await Promise.all([getSuppliers(), getProducts(), getPurchaseOrders()]);
      setSuppliers(supData);
      setProducts(prodData);
      setPOs(poData);
    } catch {
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const lowStockCount = products.filter((p) => p.stock <= p.reorder_point).length;

  const handleSave = async () => {
    if (!form.name) return toast.error("Supplier name is required");
    try {
      await createSupplier({
        name: form.name,
        contact_email: form.contact_email,
        phone: form.phone,
        address: form.address,
        lead_time_days: parseInt(form.lead_time_days) || 14,
        notes: form.notes,
      });
      toast.success("Supplier added");
      setModal(false);
      setForm({ name: "", contact_email: "", phone: "", address: "", lead_time_days: "14", notes: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to add supplier");
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex justify-between mb-5">
          <div className="text-[13px] text-gray-400">{suppliers.length} suppliers</div>
          <Button onClick={() => setModal(true)}>+ Add Supplier</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((s) => {
            const poCount = pos.filter((po) => po.supplier_id === s.id).length;
            const activePOs = pos.filter((po) => po.supplier_id === s.id && po.status === "ordered").length;
            return (
              <div key={s.id} className="bg-surface-card border border-border rounded-[14px] p-6 hover:border-border-light transition-colors">
                <div className="font-bold text-base text-gray-100 mb-3">{s.name}</div>
                <div className="flex flex-col gap-2 mb-4">
                  {s.contact_email && <div className="text-[13px] text-gray-400">📧 {s.contact_email}</div>}
                  {s.phone && <div className="text-[13px] text-gray-400">📞 {s.phone}</div>}
                  {s.address && <div className="text-[13px] text-gray-400">📍 {s.address}</div>}
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Badge color="blue">{s.lead_time_days}d lead time</Badge>
                  <Badge>{poCount} PO{poCount !== 1 ? "s" : ""}</Badge>
                  {activePOs > 0 && <Badge color="orange">{activePOs} active</Badge>}
                </div>
              </div>
            );
          })}
        </div>
        {suppliers.length === 0 && <EmptyState icon="◎" title="No suppliers" sub="Add your first supplier to get started" />}

        <Modal open={modal} onClose={() => setModal(false)} title="Add Supplier">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Company Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Lead Time (days)" type="number" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} />
            <div className="col-span-2">
              <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>Add Supplier</Button>
          </div>
        </Modal>
      </main>
    </>
  );
}
