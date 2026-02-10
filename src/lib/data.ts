import { supabase } from "./supabase";
import type {
  Product,
  Supplier,
  PurchaseOrder,
  POLineItem,
  StockMovement,
  BOM,
} from "@/types/database";

// ─── PRODUCTS ────────────────────────────────

export async function getProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data as Product[];
}

export async function getProduct(id: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Product;
}

export async function createProduct(product: Partial<Product>) {
  const { data, error } = await supabase
    .from("products")
    .insert(product as any)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: string, updates: Partial<Product>) {
  const { data, error } = await supabase
    .from("products")
    .update(updates as any)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase
    .from("products")
    .update({ is_active: false } as any)
    .eq("id", id);
  if (error) throw error;
}

// ─── SUPPLIERS ───────────────────────────────

export async function getSuppliers() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data as Supplier[];
}

export async function createSupplier(supplier: Partial<Supplier>) {
  const { data, error } = await supabase
    .from("suppliers")
    .insert(supplier as any)
    .select()
    .single();
  if (error) throw error;
  return data as Supplier;
}

export async function updateSupplier(id: string, updates: Partial<Supplier>) {
  const { data, error } = await supabase
    .from("suppliers")
    .update(updates as any)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Supplier;
}

// ─── PURCHASE ORDERS ─────────────────────────

export async function getPurchaseOrders() {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      `
      *,
      supplier:suppliers(*),
      line_items:po_line_items(
        *,
        product:products(*)
      )
    `
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PurchaseOrder[];
}

export async function getPurchaseOrder(id: string) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      `
      *,
      supplier:suppliers(*),
      line_items:po_line_items(
        *,
        product:products(*)
      )
    `
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as PurchaseOrder;
}

export async function getNextPONumber(): Promise<string> {
  const { data, error } = await supabase.rpc("next_po_number");
  if (error) {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("purchase_orders")
      .select("*", { count: "exact", head: true });
    return `PO-${year}-${String((count || 0) + 1).padStart(4, "0")}`;
  }
  return data as string;
}

export async function createPurchaseOrder(
  po: Partial<PurchaseOrder>,
  lineItems: { product_id: string; quantity: number; unit_cost: number }[]
) {
  const { data: poData, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: po.po_number,
      supplier_id: po.supplier_id,
      status: po.status || "draft",
      expected_date: po.expected_date,
      notes: po.notes || "",
    } as any)
    .select()
    .single();
  if (poError) throw poError;

  const items = lineItems.map((item) => ({
    po_id: poData.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    received_qty: 0,
  }));

  const { error: itemsError } = await supabase
    .from("po_line_items")
    .insert(items as any);
  if (itemsError) throw itemsError;

  return poData as PurchaseOrder;
}

export async function updatePOStatus(id: string, status: string) {
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function receivePurchaseOrder(poId: string) {
  const { error } = await supabase.rpc("receive_purchase_order", {
    p_po_id: poId,
  });
  if (error) throw error;
}

export async function deletePurchaseOrder(poId: string) {
  await supabase.from("po_line_items").delete().eq("po_id", poId);
  const { error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", poId);
  if (error) throw error;
}

// ─── STOCK MOVEMENTS ─────────────────────────

export async function getStockMovements(limit = 50) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select(
      `
      *,
      product:products(*)
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as StockMovement[];
}

export async function createStockMovement(movement: {
  product_id: string;
  movement_type: "in" | "out" | "adjustment";
  quantity: number;
  reference?: string;
  notes?: string;
}) {
  const { data, error } = await supabase
    .from("stock_movements")
    .insert(movement as any)
    .select()
    .single();
  if (error) throw error;

  const product = await getProduct(movement.product_id);
  let newStock = product.stock;
  if (movement.movement_type === "in") {
    newStock += movement.quantity;
  } else if (movement.movement_type === "out") {
    newStock = Math.max(0, newStock - movement.quantity);
  } else {
    newStock = movement.quantity;
  }

  await updateProduct(movement.product_id, { stock: newStock });
  return data as StockMovement;
}

// ─── BOM ─────────────────────────────────────

export async function getBOMs() {
  const { data, error } = await supabase
    .from("bom")
    .select(
      `
      *,
      product:products(*),
      components:bom_components(*)
    `
    )
    .order("name");
  if (error) throw error;
  return data as BOM[];
}

// ─── DASHBOARD STATS ─────────────────────────

export async function getDashboardStats() {
  const [products, movements, pos] = await Promise.all([
    getProducts(),
    getStockMovements(10),
    getPurchaseOrders(),
  ]);

  const totalValue = products.reduce((s, p) => s + p.stock * p.cost, 0);
  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  const lowStockItems = products.filter((p) => p.stock <= p.reorder_point);
  const pendingPOs = pos.filter((po) => po.status === "ordered");
  const draftPOs = pos.filter((po) => po.status === "draft");
  const categories = Array.from(new Set(products.map((p) => p.category)));

  return {
    products,
    movements,
    purchaseOrders: pos,
    totalValue,
    totalUnits,
    lowStockItems,
    pendingPOs,
    draftPOs,
    categories,
  };
}
