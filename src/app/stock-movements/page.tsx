"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getStockMovements, getProducts, createStockMovement } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import {
  Button, Badge, Modal, Input, Select,
  Table, TableHeader, TableRow, TableCell,
  EmptyState, LoadingSpinner,
} from "@/components/ui";
import type { Product, StockMovement } from "@/types/database";

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "in" | "out">("all");
  const [form, setForm] = useState({ productId: "", type: "in", qty: "1", ref: "", notes: "" });

  const load = async () => {
    try {
      const [movData, prodData] = await Promise.all([getStockMovements(100), getProducts()]);
      setMovements(movData);
      setProducts(prodData);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const lowStockCount = products.filter((p) => p.stock <= p.reorder_point).length;
  const filtered = filterType === "all" ? movements : movements.filter((m) => m.movement_type === filterType);

  const handleSave = async () => {
    if (!form.productId) return toast.error("Select a product");
    if (!parseInt(form.qty)) return toast.error("Enter a valid quantity");
    try {
      await createStockMovement({
        product_id: form.productId,
        movement_type: form.type as "in" | "out",
        quantity: parseInt(form.qty),
        reference: form.ref,
        notes: form.notes,
      });
      toast.success("Stock movement recorded");
      setModal(false);
      setForm({ productId: "", type: "in", qty: "1", ref: "", notes: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to record movement");
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        <div className="flex justify-between items-center mb-5">
          <div className="flex gap-2">
            {(["all", "in", "out"] as const).map((t) => (
              <Button key={t} size="sm" variant={filterType === t ? "primary" : "secondary"} onClick={() => setFilterType(t)}>
                {t === "all" ? "All" : t === "in" ? "↓ Inbound" : "↑ Outbound"}
              </Button>
            ))}
          </div>
          <Button onClick={() => setModal(true)}>+ Record Movement</Button>
        </div>

        <Table>
          <TableHeader columns={["Type", "Product", "Quantity", "Reference", "Date", "Notes"]} />
          <tbody>
            {filtered.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Badge color={m.movement_type === "in" ? "green" : "red"}>
                    {m.movement_type === "in" ? "Inbound" : "Outbound"}
                  </Badge>
                </TableCell>
                <TableCell className="font-semibold text-gray-100">
                  {m.product?.image} {m.product?.name || "Unknown"}
                </TableCell>
                <TableCell className={`font-bold text-sm font-mono ${m.movement_type === "in" ? "text-emerald-400" : "text-red-400"}`}>
                  {m.movement_type === "in" ? "+" : "−"}{m.quantity}
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-400">{m.reference || "—"}</TableCell>
                <TableCell className="text-xs text-gray-400">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-xs text-gray-500">{m.notes}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
        {filtered.length === 0 && <EmptyState icon="📊" title="No movements" sub="Record your first stock movement" />}

        <Modal open={modal} onClose={() => setModal(false)} title="Record Stock Movement">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Product"
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
              options={[
                { value: "", label: "Select a product..." },
                ...products.map((p) => ({ value: p.id, label: `${p.image} ${p.name} (${p.stock} in stock)` })),
              ]}
            />
            <Select
              label="Type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              options={[
                { value: "in", label: "↓ Inbound (receiving)" },
                { value: "out", label: "↑ Outbound (shipping)" },
              ]}
            />
            <Input label="Quantity" type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            <Input label="Reference" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="e.g. SO-1234, PO-2026-001" />
            <div className="col-span-2">
              <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
          </div>
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>Record Movement</Button>
          </div>
        </Modal>
      </main>
    </>
  );
}
