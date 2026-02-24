"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { getProducts } from "@/lib/data";

interface CustomsEntry {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  po_number: string;
  type: string;
  notes: string;
  created_at: string;
}

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  vendor: "",
  amount: "",
  po_number: "",
  type: "",
  notes: "",
};

const TYPE_OPTIONS = [
  { value: "", label: "Select type..." },
  { value: "US Government", label: "US Government" },
  { value: "International", label: "International" },
];

export default function ForCustomsPage() {
  const [entries, setEntries] = useState<CustomsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CustomsEntry | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [search, setSearch] = useState("");

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("customs_entries")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch (err: any) {
      toast.error("Failed to load customs entries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const prods = await getProducts();
      setProducts(prods);
      await loadEntries();
    };
    init();
  }, []);

  const lowStockCount = products.filter((p: any) => p.stock <= p.reorder_point).length;

  const handleAdd = async () => {
    if (!form.vendor) return toast.error("Vendor is required");
    if (!form.date) return toast.error("Date is required");
    try {
      const { error } = await supabase.from("customs_entries").insert({
        date: form.date,
        vendor: form.vendor,
        amount: parseFloat(form.amount) || 0,
        po_number: form.po_number,
        type: form.type,
        notes: form.notes,
      });
      if (error) throw error;
      toast.success("Entry added");
      setAddModal(false);
      setForm(emptyForm);
      loadEntries();
    } catch (err: any) {
      toast.error(err.message || "Failed to add entry");
    }
  };

  const openEdit = (entry: CustomsEntry) => {
    setEditingEntry(entry);
    setForm({
      date: entry.date || "",
      vendor: entry.vendor || "",
      amount: String(entry.amount || ""),
      po_number: entry.po_number || "",
      type: entry.type || "",
      notes: entry.notes || "",
    });
    setEditModal(true);
  };

  const handleEdit = async () => {
    if (!editingEntry) return;
    if (!form.vendor) return toast.error("Vendor is required");
    try {
      const { error } = await supabase
        .from("customs_entries")
        .update({
          date: form.date,
          vendor: form.vendor,
          amount: parseFloat(form.amount) || 0,
          po_number: form.po_number,
          type: form.type,
          notes: form.notes,
        })
        .eq("id", editingEntry.id);
      if (error) throw error;
      toast.success("Entry updated");
      setEditModal(false);
      setEditingEntry(null);
      setForm(emptyForm);
      loadEntries();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  const handleDelete = async (entry: CustomsEntry) => {
    if (!confirm(`Delete this customs entry from ${entry.vendor}?`)) return;
    try {
      const { error } = await supabase.from("customs_entries").delete().eq("id", entry.id);
      if (error) throw error;
      toast.success("Entry deleted");
      loadEntries();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const filtered = entries.filter((e) =>
    !search ||
    e.vendor.toLowerCase().includes(search.toLowerCase()) ||
    (e.po_number || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.type || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.notes || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  const renderForm = () => (
    <div className="grid grid-cols-2 gap-4">
      <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Input label="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor name..." />
      <Input label="Amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
      <Input label="PO #" value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} placeholder="PO number..." />
      <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={TYPE_OPTIONS} />
      <div />
      <div className="col-span-2">
        <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." />
      </div>
    </div>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <div className="text-[13px] text-gray-400">{filtered.length} customs entr{filtered.length !== 1 ? "ies" : "y"}</div>
            <div className="text-[14px] font-bold text-brand">{formatCurrency(totalAmount)}</div>
          </div>
          <Button onClick={() => { setForm(emptyForm); setAddModal(true); }}>+ Add Entry</Button>
        </div>

        {/* Search */}
        <div className="mb-5">
          <input
            type="text"
            placeholder="Search by vendor, PO#, type, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand"
          />
        </div>

        {/* Table */}
        {filtered.length > 0 ? (
          <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Vendor</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">PO #</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className="border-b border-border hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3.5 text-[13px] text-gray-300 whitespace-nowrap">
                      {entry.date ? new Date(entry.date).toLocaleDateString("en-US", { timeZone: "UTC" }) : "-"}
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-100 font-medium">{entry.vendor}</td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-100 font-bold text-right">{formatCurrency(entry.amount || 0)}</td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-400 font-mono">{entry.po_number || "-"}</td>
                    <td className="px-4 py-3.5 text-[13px]">
                      {entry.type ? <Badge>{entry.type}</Badge> : <span className="text-gray-500">-</span>}
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-500 max-w-[200px] truncate">{entry.notes || "-"}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(entry)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(entry)} className="!text-red-400">Del</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="F" title="No customs entries" sub="Add your first customs entry to get started" />
        )}

        {/* Add Modal */}
        <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Customs Entry">
          {renderForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add Entry</Button>
          </div>
        </Modal>

        {/* Edit Modal */}
        <Modal open={editModal} onClose={() => { setEditModal(false); setEditingEntry(null); }} title="Edit Customs Entry">
          {renderForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => { setEditModal(false); setEditingEntry(null); }}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </div>
        </Modal>
      </main>
    </>
  );
}
