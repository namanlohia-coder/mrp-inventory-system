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

// Get total amount for POs by status
export async function getPurchaseOrdersTotal(status?: string) {
  let query = supabase
    .from("purchase_orders")
    .select("total_amount");
  if (status) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) throw error;
  const total = (data || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  return total;
}

// Light version - just PO headers with supplier name, no line items
export async function getPurchaseOrdersList(limit = 50, offset = 0, status?: string) {
  let query = supabase
    .from("purchase_orders")
    .select(
      `
      *,
      supplier:suppliers(id, name)
    `,
      { count: "exact" }
    );
  
  if (status) {
    query = query.eq("status", status);
  }
  
  // Sort open POs by expected_date, received POs by received_date
  if (status === "ordered") {
    query = query.order("expected_date", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("received_date", { ascending: false, nullsFirst: false });
  }
  
  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data as PurchaseOrder[], count: count || 0 };
}

// Search POs by number or supplier name
export async function searchPurchaseOrders(query: string, limit = 100, status?: string) {
  // Search by PO number
  let poQuery = supabase
    .from("purchase_orders")
    .select(`*, supplier:suppliers(id, name)`)
    .ilike("po_number", `%${query}%`);
  if (status) poQuery = poQuery.eq("status", status);
  poQuery = poQuery.order("received_date", { ascending: false, nullsFirst: false }).limit(limit);
  const { data: byPO, error: e1 } = await poQuery;
  if (e1) throw e1;

  // Search by supplier name - get matching supplier IDs first
  const { data: matchingSuppliers } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", `%${query}%`);
  
  let bySupplier: PurchaseOrder[] = [];
  if (matchingSuppliers && matchingSuppliers.length > 0) {
    const ids = matchingSuppliers.map(s => s.id);
    let supQuery = supabase
      .from("purchase_orders")
      .select(`*, supplier:suppliers(id, name)`)
      .in("supplier_id", ids);
    if (status) supQuery = supQuery.eq("status", status);
    supQuery = supQuery.order("received_date", { ascending: false, nullsFirst: false }).limit(limit);
    const { data, error } = await supQuery;
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
  const totalAmount = lineItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
  const { data: poData, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: po.po_number,
      supplier_id: po.supplier_id,
      status: po.status || "draft",
      expected_date: po.expected_date,
      notes: po.notes || "",
      total_amount: totalAmount,
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

export async function updatePurchaseOrder(
  id: string,
  updates: { supplier_id?: string; expected_date?: string | null; notes?: string; total_amount?: number },
  newLineItems?: { product_id: string; quantity: number; unit_cost: number }[]
) {
  const { error: poError } = await supabase
    .from("purchase_orders")
    .update(updates as any)
    .eq("id", id);
  if (poError) throw poError;

  if (newLineItems) {
    // Delete old line items and insert new ones
    await supabase.from("po_line_items").delete().eq("po_id", id);
    const items = newLineItems.map((item) => ({
      po_id: id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      received_qty: 0,
    }));
    const { error: itemsError } = await supabase
      .from("po_line_items")
      .insert(items as any);
    if (itemsError) throw itemsError;
  }
}

export async function duplicatePurchaseOrder(sourcePOId: string, newPONumber: string) {
  // Get the full source PO with line items
  const source = await getPurchaseOrder(sourcePOId);

  // Create new PO
  const { data: newPO, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: newPONumber,
      supplier_id: source.supplier_id,
      status: "ordered",
      expected_date: source.expected_date,
      notes: source.notes ? `[Duplicated from ${source.po_number}] ${source.notes}` : `Duplicated from ${source.po_number}`,
      total_amount: source.total_amount || source.line_items?.reduce((s, i) => s + i.quantity * i.unit_cost, 0) || 0,
    } as any)
    .select()
    .single();
  if (poError) throw poError;

  // Copy line items
  if (source.line_items && source.line_items.length > 0) {
    const items = source.line_items.map((item) => ({
      po_id: newPO.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      received_qty: 0,
    }));
    const { error: itemsError } = await supabase
      .from("po_line_items")
      .insert(items as any);
    if (itemsError) throw itemsError;
  }

  return newPO as PurchaseOrder;
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

// ─── PARTIAL RECEIVING ──────────────────────────

export async function partialReceivePO(
  poId: string,
  receivedItems: { line_item_id: string; product_id: string; received_qty: number }[]
) {
  // Update received_qty on each line item
  for (const item of receivedItems) {
    if (item.received_qty <= 0) continue;

    // Get current line item
    const { data: lineItem, error: liErr } = await supabase
      .from("po_line_items")
      .select("received_qty, quantity")
      .eq("id", item.line_item_id)
      .single();
    if (liErr) throw liErr;

    const newReceivedQty = (lineItem.received_qty || 0) + item.received_qty;

    // Update line item received_qty
    const { error: updateErr } = await supabase
      .from("po_line_items")
      .update({ received_qty: newReceivedQty } as any)
      .eq("id", item.line_item_id);
    if (updateErr) throw updateErr;

    // Update product stock
    const product = await getProduct(item.product_id);
    await updateProduct(item.product_id, { stock: product.stock + item.received_qty });

    // Create stock movement
    await supabase.from("stock_movements").insert({
      product_id: item.product_id,
      movement_type: "in",
      quantity: item.received_qty,
      reference: `PO partial receive`,
      notes: `Partial receive from PO ${poId}`,
    } as any);
  }

  // Check if all items are fully received
  const { data: allItems, error: allErr } = await supabase
    .from("po_line_items")
    .select("quantity, received_qty")
    .eq("po_id", poId);
  if (allErr) throw allErr;

  const allFullyReceived = (allItems || []).every(
    (item) => (item.received_qty || 0) >= item.quantity
  );

  if (allFullyReceived) {
    // Mark PO as fully received
    await supabase
      .from("purchase_orders")
      .update({ status: "received", received_date: new Date().toISOString().split("T")[0] } as any)
      .eq("id", poId);
  } else {
    // Mark as partially_received
    await supabase
      .from("purchase_orders")
      .update({ status: "partially_received" } as any)
      .eq("id", poId);
  }
}

// ─── CSV IMPORT ─────────────────────────────────

export async function findOrCreateProduct(name: string, sku: string, unitCost: number): Promise<string> {
  // Try to find by SKU first
  if (sku) {
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("sku", sku)
      .eq("is_active", true)
      .limit(1);
    if (existing && existing.length > 0) return existing[0].id;
  }

  // Try to find by name
  const { data: byName } = await supabase
    .from("products")
    .select("id")
    .eq("name", name)
    .eq("is_active", true)
    .limit(1);
  if (byName && byName.length > 0) return byName[0].id;

  // Create new product
  const product = await createProduct({
    name,
    sku: sku || "",
    category: "Imported",
    unit: "pcs",
    stock: 0,
    cost: unitCost,
    reorder_point: 0,
  } as any);
  return product.id;
}

export async function findOrCreateSupplier(name: string): Promise<string> {
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", name)
    .eq("is_active", true)
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id;

  const supplier = await createSupplier({
    name,
    contact_name: "",
    email: "",
    phone: "",
    address: "",
  } as any);
  return supplier.id;
}

// ─── REPORTS ────────────────────────────────────

export async function getReportData() {
  // Get all received POs with supplier info
  const { data: receivedPOs, error: poErr } = await supabase
    .from("purchase_orders")
    .select(`*, supplier:suppliers(id, name)`)
    .eq("status", "received")
    .order("received_date", { ascending: true });
  if (poErr) throw poErr;

  // Get all products for inventory valuation
  const products = await getProducts();

  return {
    receivedPOs: receivedPOs || [],
    products,
  };
}
