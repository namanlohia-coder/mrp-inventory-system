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
    .order("name")
    .limit(2000);
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

// Get total amount for all POs (or filtered)
export async function getPurchaseOrdersTotal() {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("total_amount");
  if (error) throw error;
  const total = (data || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  return total;
}

// Light version - just PO headers with supplier name, no line items
export async function getPurchaseOrdersList(limit = 50, offset = 0) {
  const { data, error, count } = await supabase
    .from("purchase_orders")
    .select(
      `
      *,
      supplier:suppliers(id, name)
    `,
      { count: "exact" }
    )
    .order("received_date", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data as PurchaseOrder[], count: count || 0 };
}

// Search POs by number or supplier name
export async function searchPurchaseOrders(query: string, limit = 100) {
  // Search by PO number
  const { data: byPO, error: e1 } = await supabase
    .from("purchase_orders")
    .select(`*, supplier:suppliers(id, name)`)
    .ilike("po_number", `%${query}%`)
    .order("received_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (e1) throw e1;

  // Search by supplier name - get matching supplier IDs first
  const { data: matchingSuppliers } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", `%${query}%`);
  
  let bySupplier: PurchaseOrder[] = [];
  if (matchingSuppliers && matchingSuppliers.length > 0) {
    const ids = matchingSuppliers.map(s => s.id);
    const { data, error } = await supabase
      .from("purchase_orders")
      .select(`*, supplier:suppliers(id, name)`)
      .in("supplier_id", ids)
      .order("received_date", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (!error && data) bySupplier = data as PurchaseOrder[];
  }

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: PurchaseOrder[] = [];
  for (const po of [...(byPO || []), ...bySupplier]) {
    if (!seen.has(po.id)) {
      seen.add(po.id);
      merged.push(po as PurchaseOrder);
    }
  }
  return merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// Full PO with line items - only when viewing a single PO
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

// Keep old function for backward compat but limit it
export async function getPurchaseOrders() {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      `
      *,
      supplier:suppliers(id, name)
    `
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as PurchaseOrder[];
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
  // Only get counts, not full data for POs
  const [products, movements] = await Promise.all([
    getProducts(),
    getStockMovements(10),
  ]);

  // Get PO counts via lightweight queries
  const { count: totalPOs } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true });

  const { count: pendingCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "ordered");

  const { count: draftCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "draft");

  const totalValue = products.reduce((s, p) => s + p.stock * p.cost, 0);
  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  const lowStockItems = products.filter((p) => p.stock <= p.reorder_point);
  const categories = Array.from(new Set(products.map((p) => p.category)));

  return {
    products,
    movements,
    purchaseOrders: [],
    totalValue,
    totalUnits,
    lowStockItems,
    pendingPOs: { length: pendingCount || 0 },
    draftPOs: { length: draftCount || 0 },
    totalPOs: totalPOs || 0,
    categories,
  };
}
