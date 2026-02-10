"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/data";
import { Header } from "@/components/layout/Header";
import {
  Button, Badge, SearchBar, Select, Modal, Input,
  Table, TableHeader, TableRow, TableCell,
  EmptyState, LoadingSpinner,
} from "@/components/ui";
import { formatCurrency, getStockStatus } from "@/lib/utils";
import type { Product } from "@/types/database";

const emptyForm = {
  name: "", sku: "", category: "General", price: "",
  cost: "", stock: "0", reorder_point: "10", unit: "pcs", image: "📦",
};

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  const load = () => {
    getProducts()
      .then(setProducts)
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const categories = Array.from(new Set(products.map((p) => p.category)));
  const lowStockCount = products.filter((p) => p.stock <= p.reorder_point).length;

  const filtered = products.filter((p) => {
    const matchSearch = (p.name + p.sku).toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const openEdit = (p: Product) => {
    setForm({ ...p, price: String(p.price), cost: String(p.cost), stock: String(p.stock), reorder_point: String(p.reorder_point) });
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name || !form.sku) return toast.error("Name and SKU are required");
    try {
      const payload = {
        name: form.name, sku: form.sku, category: form.category,
        price: parseFloat(form.price) || 0, cost: parseFloat(form.cost) || 0,
        stock: parseInt(form.stock) || 0, reorder_point: parseInt(form.reorder_point) || 0,
        unit: form.unit, image: form.image,
      };
      if (modal === "add") {
        await createProduct(payload);
        toast.success("Product created");
      } else {
        await updateProduct(form.id, payload);
        toast.success("Product updated");
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await deleteProduct(id);
      toast.success("Product deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        {/* Toolbar */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex gap-3 items-center flex-1">
            <div className="w-72">
              <SearchBar value={search} onChange={setSearch} placeholder="Search products..." />
            </div>
            <Select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              options={[
                { value: "all", label: "All Categories" },
                ...categories.map((c) => ({ value: c, label: c })),
              ]}
            />
          </div>
          <Button onClick={() => { setForm(emptyForm); setModal("add"); }}>
            + Add Product
          </Button>
        </div>

        {/* Table */}
        <Table>
          <TableHeader
            columns={["Product", "SKU", "Category", "Stock", "Cost", "Price", "Value", "Status", ""]}
          />
          <tbody>
            {filtered.map((p) => {
              const status = getStockStatus(p.stock, p.reorder_point);
              return (
                <TableRow key={p.id} onClick={() => openEdit(p)}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{p.image}</span>
                      <span className="font-semibold text-gray-100">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-400">{p.sku}</TableCell>
                  <TableCell><Badge>{p.category}</Badge></TableCell>
                  <TableCell className={`font-bold text-sm ${status.color === "orange" ? "text-amber-400" : status.color === "red" ? "text-red-400" : "text-gray-100"}`}>
                    {p.stock} {p.unit}
                  </TableCell>
                  <TableCell className="text-gray-400">{formatCurrency(p.cost)}</TableCell>
                  <TableCell className="font-semibold text-gray-100">{formatCurrency(p.price)}</TableCell>
                  <TableCell className="text-gray-400">{formatCurrency(p.stock * p.cost)}</TableCell>
                  <TableCell>
                    <Badge color={status.color as any}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm" variant="ghost"
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    >
                      🗑
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
        {filtered.length === 0 && (
          <EmptyState icon="🔍" title="No products found" sub="Try adjusting your search or filters" />
        )}

        {/* Add/Edit Modal */}
        <Modal
          open={!!modal}
          onClose={() => setModal(null)}
          title={modal === "add" ? "Add Product" : "Edit Product"}
        >
          <div className="grid grid-cols-2 gap-4">
            <Input label="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <Input label="Cost Price ($)" type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <Input label="Sell Price ($)" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <Input label="Current Stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            <Input label="Reorder Point" type="number" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} />
            <Input label="Emoji Icon" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2.5 mt-6">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={handleSave}>{modal === "add" ? "Add Product" : "Save Changes"}</Button>
          </div>
        </Modal>
      </main>
    </>
  );
}
