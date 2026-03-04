"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/layout/Header";
import { Button, Modal, Input, EmptyState, LoadingSpinner } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { getProducts } from "@/lib/data";

interface COGSEntry {
  id: string;
  date: string;
  name: string;
  amount: number;
  po_number: string;
  notes: string;
  created_at: string;
}

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  name: "",
  amount: "",
  po_number: "",
  notes: "",
};

export default function COGSPage() {
  const [entries, setEntries] = useState<COGSEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<COGSEntry | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [search, setSearch] = useState("");

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("cogs_entries")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch (err: any) {
      toast.error("Failed to load COGS entries");
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
    if (!form.name) return toast.error("Name is required");
    if (!form.date) return toast.error("Date is required");
    try {
      const { error } = await supabase.from("cogs_entries").insert({
        date: form.date,
        name: form.name,
        amount: parseFloat(form.amount) || 0,
        po_number: form.po_number,
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

  const openEdit = (entry: COGSEntry) => {
    setEditingEntry(entry);
    setForm({
      date: entry.date || "",
      name: entry.name || "",
      amount: String(entry.amount || ""),
      po_number: entry.po_number || "",
      notes: entry.notes || "",
    });
    setEditModal(true);
  };

  const handleEdit = async () => {
    if (!editingEntry) return;
    if (!form.name) return toast.error("Name is required");
    try {
      const { error } = await supabase
        .from("cogs_entries")
        .update({
          date: form.date,
          name: form.name,
          amount: parseFloat(form.amount) || 0,
          po_number: form.po_number,
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

  const handleDelete = async (entry: COGSEntry) => {
    if (!confirm(`Delete COGS entry "${entry.name}"?`)) return;
    try {
      const { error } = await supabase.from("cogs_entries").delete().eq("id", entry.id);
      if (error) throw error;
      toast.success("Entry deleted");
      loadEntries();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const filtered = entries.filter((e) =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.po_number || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.notes || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  const renderForm = () => (
    <div className="grid grid-cols-2 gap-4">
      <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Input label="Name / Description" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Motor assemblies, PCB batch..." />
      <Input label="Amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
      <Input label="PO #" value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} placeholder="PO number..." />
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
            <div className="text-[13px] text-gray-400">{filtered.length} COGS entr{filtered.length !== 1 ? "ies" : "y"}</div>
            <div className="text-[14px] font-bold text-brand">{formatCurrency(totalAmount)}</div>
          </div>
          <Button onClick={() => { setForm(emptyForm); setAddModal(true); }}>+ Add Entry</Button>
        </div>

        {/* Search */}
        <div className="mb-5">
          <input
            type="text"
            placeholder="Search by name, PO#, or notes..."
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
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Name / Description</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">PO #</th>
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
                    <td className="px-4 py-3.5 text-[13px] text-gray-100 font-medium">{entry.name}</td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-100 font-bold text-right">{formatCurrency(entry.amount || 0)}</td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-400 font-mono">{entry.po_number || "-"}</td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-500 max-w-[250px] truncate">{entry.notes || "-"}</td>
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
          <EmptyState icon="$" title="No COGS entries" sub="Add your first COGS entry to start tracking costs" />
        )}

        {/* Add Modal */}
        <Modal open={addModal} onClose={() => setAddModal(false)} title="Add COGS Entry">
          {renderForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add Entry</Button>
          </div>
        </Modal>

        {/* Edit Modal */}
        <Modal open={editModal} onClose={() => { setEditModal(false); setEditingEntry(null); }} title="Edit COGS Entry">
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
