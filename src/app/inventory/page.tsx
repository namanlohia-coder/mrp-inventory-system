"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { getProducts, getSuppliers, createProduct, updateProduct, deleteProduct } from "@/lib/data";
import { Header } from "@/components/layout/Header";
import {
  Button, Badge, SearchBar, Select, Modal, Input,
  Table, TableHeader, TableRow, TableCell,
  EmptyState, LoadingSpinner,
} from "@/components/ui";
import { formatCurrency, getStockStatus } from "@/lib/utils";
import type { Product, Supplier } from "@/types/database";

const emptyForm = {
  name: "", sku: "", category: "General", price: "",
  cost: "", stock: "0", reorder_point: "10", unit: "pcs", image: "",
  default_supplier_id: "",
};

function InventoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [supFilter, setSupFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "good">(
    (searchParams.get("filter") as any) || "all"
  );
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  const load = () => {
    Promise.all([getProducts(), getSuppliers()])
      .then(([prods, sups]) => { setProducts(prods); setSuppliers(sups); })
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    const f = searchParams.get("filter");
    if (f === "low") setStockFilter("low");
  }, [searchParams]);

  const categories = Array.from(new Set(products.map((p) => p.category)));
  const lowStockCount = products.filter((p) => p.stock <= p.reorder_point).length;

  let filtered = products.filter((p) => {
    const matchSearch = (p.name + p.sku).toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || p.category === catFilter;
    const matchSup = supFilter === "all" || p.default_supplier_id === supFilter;
    return matchSearch && matchCat && matchSup;
  });

  if (stockFilter === "low") filtered = filtered.filter((p) => p.stock > 0 && p.stock <= p.reorder_point);
  else if (stockFilter === "out") filtered = filtered.filter((p) => p.stock <= 0);
  else if (stockFilter === "good") filtered = filtered.filter((p) => p.stock > p.reorder_point);

  const totalItems = filtered.length;
  const totalValue = filtered.reduce((s, p) => s + p.stock * p.cost, 0);

  const openEdit = (p: Product) => {
    setForm({
      ...p, price: String(p.price), cost: String(p.cost),
      stock: String(p.stock), reorder_point: String(p.reorder_point),
      default_supplier_id: p.default_supplier_id || "",
    });
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name || !form.sku) return toast.error("Name and SKU are required");
    try {
      const payload: any = {
        name: form.name, sku: form.sku, category: form.category,
        price: parseFloat(form.price) || 0, cost: parseFloat(form.cost) || 0,
        stock: parseInt(form.stock) || 0, reorder_point: parseInt(form.reorder_point) || 0,
        unit: form.unit, image: form.image,
      };
      if (form.default_supplier_id) payload.default_supplier_id = form.default_supplier_id;
      if (modal === "add") { await createProduct(payload); toast.success("Product created"); }
      else { await updateProduct(form.id, payload); toast.success("Product updated"); }
      setModal(null); load();
    } catch (err: any) { toast.error(err.message || "Save failed"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try { await deleteProduct(id); toast.success("Product deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <Header lowStockCount={lowStockCount} />
      <main className="flex-1 overflow-auto p-8">
        {/* Summary + toolbar */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-4">
            <div className="text-[13px] text-gray-400">{totalItems} item{totalItems !== 1 ? "s" : ""}</div>
            <div className="text-[14px] font-bold text-brand">{formatCurrency(totalValue)} total value</div>
          </div>
          <Button onClick={() => { setForm(emptyForm); setModal("add"); }}>+ Add Product</Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2.5 items-center mb-5 flex-wrap">
          <div className="w-72">
            <SearchBar value={search} onChange={setSearch} placeholder="Search products..." />
          </div>
          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            options={[{ value: "all", label: "All Categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
          <Select value={supFilter} onChange={(e) => setSupFilter(e.target.value)}
            options={[{ value: "all", label: "All Suppliers" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
          <div className="flex gap-1">
            {(["all", "low", "out", "good"] as const).map((f) => (
              <button key={f} onClick={() => {
                  setStockFilter(f);
                  if (f !== "low") router.replace("/inventory", { scroll: false });
                }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                  stockFilter === f ? "bg-brand/20 border-brand text-brand" : "bg-surface-card border-border text-gray-400 hover:border-border-light"}`}>
                {f === "all" ? "All" : f === "low" ? "Low Stock" : f === "out" ? "Out" : "Good"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader columns={["Product", "SKU", "Category", "Supplier", "Stock", "Reorder Pt", "Cost", "Value", "Status", ""]} />
          <tbody>
            {filtered.map((p) => {
              const status = getStockStatus(p.stock, p.reorder_point);
              const supplierName = (p as any).default_supplier?.name || "-";
              return (
                <TableRow key={p.id} onClick={() => openEdit(p)}>
                  <TableCell>
                    <span className="font-semibold text-gray-100">{p.name}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-400">{p.sku}</TableCell>
                  <TableCell><Badge>{p.category}</Badge></TableCell>
                  <TableCell className="text-[12px] text-gray-400">{supplierName}</TableCell>
                  <TableCell className={`font-bold text-sm ${
                    status.color === "red" ? "text-red-400" : status.color === "orange" ? "text-amber-400" : "text-gray-100"
                  }`}>
                    {p.stock} {p.unit}
                  </TableCell>
                  <TableCell className="text-gray-500 text-[12px]">{p.reorder_point}</TableCell>
                  <TableCell className="text-gray-400">{formatCurrency(p.cost)}</TableCell>
                  <TableCell className="font-medium text-gray-200">{formatCurrency(p.stock * p.cost)}</TableCell>
                  <TableCell><Badge color={status.color as any}>{status.label}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost"
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>
                      Del
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
        {filtered.length === 0 && (
          <EmptyState icon="?" title="No products found" sub="Try adjusting your search or filters" />
        )}

        {/* Add/Edit Modal */}
        <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "add" ? "Add Product" : "Edit Product"}>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <Input label="Cost Price ($)" type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <Input label="Sell Price ($)" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <Input label="Current Stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            <Input label="Reorder Point" type="number" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} />
            <div className="col-span-2">
              <Select label="Default Supplier" value={form.default_supplier_id || ""} onChange={(e) => setForm({ ...form, default_supplier_id: e.target.value })}
                options={[{ value: "", label: "None" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
            </div>
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

export default function InventoryPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <InventoryContent />
    </Suspense>
  );
}
