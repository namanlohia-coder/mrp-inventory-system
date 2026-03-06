"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/layout/Header";
import { Button, Badge, Modal, Input, Select, EmptyState, LoadingSpinner } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { getProducts } from "@/lib/data";

interface PrepaidEntry {
  id: string;
  name: string;
  date_placed: string;
  received: string;
  po_number: string;
  amount: number;
  notes: string;
  created_at: string;
}

const emptyForm = {
  name: "",
  date_placed: new Date().toISOString().split("T")[0],
  received: "No",
  po_number: "",
  amount: "",
  notes: "",
};

const RECEIVED_OPTIONS = [
  { value: "No", label: "No" },
  { value: "Yes", label: "Yes" },
  { value: "Partial", label: "Partial" },
];

const RECEIVED_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "No", label: "Not Received" },
  { value: "Yes", label: "Received" },
  { value: "Partial", label: "Partial" },
];

function getReceivedColor(val: string): "green" | "red" | "orange" | "default" {
  if (val === "Yes") return "green";
  if (val === "Partial") return "orange";
  if (val === "No") return "red";
  return "default";
}

export default function PrepaidInventoryPage() {
  const [entries, setEntries] = useState<PrepaidEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PrepaidEntry | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [search, setSearch] = useState("");
  const [filterReceived, setFilterReceived] = useState("all");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "po-asc" | "po-desc">("name-asc");

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("prepaid_inventory")
        .select("*")
        .order("date_placed", { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch (err: any) {
      toast.error("Failed to load prepaid inventory");
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
    if (!form.name) return toast.error("Vendor name is required");
    try {
      const { error } = await supabase.from("prepaid_inventory").insert({
        name: form.name,
        date_placed: form.date_placed || null,
        received: form.received || "No",
        po_number: form.po_number,
        amount: parseFloat(form.amount) || 0,
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

  const openEdit = (entry: PrepaidEntry) => {
    setEditingEntry(entry);
    setForm({
      name: entry.name || "",
      date_placed: entry.date_placed || "",
      received: entry.received || "No",
      po_number: entry.po_number || "",
      amount: String(entry.amount || ""),
      notes: entry.notes || "",
    });
    setEditModal(true);
  };

  const handleEdit = async () => {
    if (!editingEntry) return;
    if (!form.name) return toast.error("Vendor name is required");
    try {
      const { error } = await supabase
        .from("prepaid_inventory")
        .update({
          name: form.name,
          date_placed: form.date_placed || null,
          received: form.received || "No",
          po_number: form.po_number,
          amount: parseFloat(form.amount) || 0,
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

  const handleDelete = async (entry: PrepaidEntry) => {
    if (!confirm(`Delete prepaid entry for "${entry.name}"?`)) return;
    try {
      const { error } = await supabase.from("prepaid_inventory").delete().eq("id", entry.id);
      if (error) throw error;
      toast.success("Entry deleted");
      loadEntries();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const filtered = entries.filter((e) => {
    const matchesSearch =
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.po_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.notes || "").toLowerCase().includes(search.toLowerCase());
    const matchesReceived = filterReceived === "all" || e.received === filterReceived;
    return matchesSearch && matchesReceived;
  }).sort((a, b) => {
    switch (sortBy) {
      case "name-asc": return (a.name || "").localeCompare(b.name || "");
      case "name-desc": return (b.name || "").localeCompare(a.name || "");
      case "date-desc": return (b.date_placed || "").localeCompare(a.date_placed || "");
      case "date-asc": return (a.date_placed || "").localeCompare(b.date_placed || "");
      case "amount-desc": return (b.amount || 0) - (a.amount || 0);
      case "amount-asc": return (a.amount || 0) - (b.amount || 0);
      case "po-asc": return (a.po_number || "").localeCompare(b.po_number || "");
      case "po-desc": return (b.po_number || "").localeCompare(a.po_number || "");
      default: return (a.name || "").localeCompare(b.name || "");
    }
  });

  const totalPrepaid = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const totalReceived = filtered.filter((e) => e.received === "Yes").reduce((s, e) => s + (e.amount || 0), 0);
  const totalOutstanding = totalPrepaid - totalReceived;

  const renderForm = () => (
    <div className="grid grid-cols-2 gap-4">
      <Input label="Vendor / Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vendor name..." />
      <Input label="Date Placed" type="date" value={form.date_placed} onChange={(e) => setForm({ ...form, date_placed: e.target.value })} />
      <Select label="Received?" value={form.received} onChange={(e) => setForm({ ...form, received: e.target.value })} options={RECEIVED_OPTIONS} />
      <Input label="PO #" value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} placeholder="PO number..." />
      <Input label="Amount (USD)" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
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
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Total Prepaid</div>
              <div className="text-[18px] font-bold text-gray-100">{formatCurrency(totalPrepaid)}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Received</div>
              <div className="text-[18px] font-bold text-emerald-400">{formatCurrency(totalReceived)}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">Outstanding</div>
              <div className="text-[18px] font-bold text-amber-400">{formatCurrency(totalOutstanding)}</div>
            </div>
          </div>
          <Button onClick={() => { setForm(emptyForm); setAddModal(true); }}>+ Add Entry</Button>
        </div>

        {/* Search + filter + sort */}
        <div className="mb-5 flex gap-3 items-center">
          <input
            type="text"
            placeholder="Search by vendor, PO#, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm bg-[#0B0F19] border border-border rounded-lg px-3.5 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand"
          />
          <select
            value={filterReceived}
            onChange={(e) => setFilterReceived(e.target.value)}
            className="bg-[#0B0F19] border border-border rounded-lg px-3 py-2 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
          >
            {RECEIVED_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-[#0B0F19] border border-border rounded-lg px-3 py-2 text-[13px] text-gray-100 focus:outline-none focus:border-brand"
          >
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="amount-desc">Highest amount</option>
            <option value="amount-asc">Lowest amount</option>
            <option value="po-asc">PO# A-Z</option>
            <option value="po-desc">PO# Z-A</option>
          </select>
          <span className="text-[12px] text-gray-500">{filtered.length} entr{filtered.length !== 1 ? "ies" : "y"}</span>
        </div>

        {/* Table */}
        {filtered.length > 0 ? (
          <div className="bg-surface-card border border-border rounded-[14px] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Date Placed</th>
                  <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Received?</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">PO #</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">USD</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className="border-b border-border hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3.5 text-[13px] text-gray-100 font-medium">{entry.name}</td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-300 whitespace-nowrap">
                      {entry.date_placed ? new Date(entry.date_placed).toLocaleDateString("en-US", { timeZone: "UTC" }) : "-"}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Badge color={getReceivedColor(entry.received)}>{entry.received || "No"}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-400 font-mono">{entry.po_number || "-"}</td>
                    <td className="px-4 py-3.5 text-[13px] text-gray-100 font-bold text-right">{formatCurrency(entry.amount || 0)}</td>
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
          <EmptyState icon="$" title="No prepaid inventory entries" sub="Add your first entry to start tracking prepaid inventory" />
        )}

        {/* Add Modal */}
        <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Prepaid Inventory Entry">
          {renderForm()}
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add Entry</Button>
          </div>
        </Modal>

        {/* Edit Modal */}
        <Modal open={editModal} onClose={() => { setEditModal(false); setEditingEntry(null); }} title="Edit Prepaid Inventory Entry">
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
