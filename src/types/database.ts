export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  cost: number;
  stock: number;
  reorder_point: number;
  unit: string;
  image: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_email: string;
  phone: string;
  address: string;
  lead_time_days: number;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  status: "draft" | "ordered" | "partial" | "received" | "cancelled";
  expected_date: string | null;
  received_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  // Joined
  supplier?: Supplier;
  line_items?: POLineItem[];
}

export interface POLineItem {
  id: string;
  po_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  received_qty: number;
  created_at: string;
  // Joined
  product?: Product;
}

export interface StockMovement {
  id: string;
  product_id: string;
  movement_type: "in" | "out" | "adjustment";
  quantity: number;
  reference: string;
  notes: string;
  created_at: string;
  // Joined
  product?: Product;
}

export interface BOM {
  id: string;
  product_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  // Joined
  product?: Product;
  components?: BOMComponent[];
}

export interface BOMComponent {
  id: string;
  bom_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  created_at: string;
}

// Supabase generated types placeholder
export interface Database {
  public: {
    Tables: {
      products: { Row: Product; Insert: Partial<Product>; Update: Partial<Product> };
      suppliers: { Row: Supplier; Insert: Partial<Supplier>; Update: Partial<Supplier> };
      purchase_orders: { Row: PurchaseOrder; Insert: Partial<PurchaseOrder>; Update: Partial<PurchaseOrder> };
      po_line_items: { Row: POLineItem; Insert: Partial<POLineItem>; Update: Partial<POLineItem> };
      stock_movements: { Row: StockMovement; Insert: Partial<StockMovement>; Update: Partial<StockMovement> };
      bom: { Row: BOM; Insert: Partial<BOM>; Update: Partial<BOM> };
      bom_components: { Row: BOMComponent; Insert: Partial<BOMComponent>; Update: Partial<BOMComponent> };
    };
  };
}
