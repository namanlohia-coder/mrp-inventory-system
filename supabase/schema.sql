-- =============================================
-- MRP INVENTORY SYSTEM - Database Schema
-- =============================================
-- Run this in your Supabase SQL Editor (supabase.com > SQL Editor)
-- This creates all tables, indexes, RLS policies, and seed data.

-- ─── EXTENSIONS ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── TABLES ──────────────────────────────────

-- Products / Inventory Items
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT DEFAULT '',
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 10,
  unit TEXT NOT NULL DEFAULT 'pcs',
  image TEXT DEFAULT '📦',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  lead_time_days INTEGER DEFAULT 14,
  notes TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partial', 'received', 'cancelled')),
  expected_date DATE,
  received_date DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Order Line Items
CREATE TABLE IF NOT EXISTS po_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  received_qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stock Movements (inbound/outbound tracking)
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL,
  reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bill of Materials
CREATE TABLE IF NOT EXISTS bom (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BOM Components
CREATE TABLE IF NOT EXISTS bom_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id UUID NOT NULL REFERENCES bom(id) ON DELETE CASCADE,
  material_name TEXT NOT NULL,
  quantity DECIMAL(12,4) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON po_line_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product ON po_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bom_product ON bom(product_id);
CREATE INDEX IF NOT EXISTS idx_bom_components_bom ON bom_components(bom_id);

-- ─── UPDATED_AT TRIGGER ─────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_po_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_bom_updated_at BEFORE UPDATE ON bom FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ─────────────────────
-- For now, allow all authenticated + anon access (you can tighten this later)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_components ENABLE ROW LEVEL SECURITY;

-- Allow full access (tighten with auth.uid() checks when you add auth)
CREATE POLICY "Allow all on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on suppliers" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on purchase_orders" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on po_line_items" ON po_line_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on stock_movements" ON stock_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bom" ON bom FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bom_components" ON bom_components FOR ALL USING (true) WITH CHECK (true);

-- ─── PRODUCTION ORDERS ───────────────────────
CREATE TABLE IF NOT EXISTS production_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  start_date DATE,
  training_date DATE,
  delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'Planning' CHECK (status IN ('Planning','In Training','In Production','Ready','Delivered')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_order_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_needed DECIMAL(12,4) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_orders_status ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_prod_orders_customer ON production_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_prod_materials_order ON production_order_materials(production_order_id);
CREATE INDEX IF NOT EXISTS idx_prod_materials_product ON production_order_materials(product_id);

CREATE TRIGGER set_production_orders_updated_at BEFORE UPDATE ON production_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_order_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on production_orders" ON production_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on production_order_materials" ON production_order_materials FOR ALL USING (true) WITH CHECK (true);

-- ─── LOGIN ATTEMPTS (rate limiting / lockout) ─
CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  attempt_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon access on login_attempts" ON login_attempts FOR ALL USING (true) WITH CHECK (true);

-- ─── HELPER FUNCTION: Receive PO ────────────
-- Call this to receive a PO: automatically updates stock + creates movements
CREATE OR REPLACE FUNCTION receive_purchase_order(p_po_id UUID)
RETURNS void AS $$
DECLARE
  line RECORD;
BEGIN
  -- Update each product's stock
  FOR line IN
    SELECT pli.product_id, pli.quantity, pli.unit_cost, po.po_number
    FROM po_line_items pli
    JOIN purchase_orders po ON po.id = pli.po_id
    WHERE pli.po_id = p_po_id
  LOOP
    -- Increase stock
    UPDATE products SET stock = stock + line.quantity WHERE id = line.product_id;

    -- Log stock movement
    INSERT INTO stock_movements (product_id, movement_type, quantity, reference, notes)
    VALUES (line.product_id, 'in', line.quantity, line.po_number, 'Received from PO ' || line.po_number);
  END LOOP;

  -- Mark PO as received
  UPDATE purchase_orders SET status = 'received', received_date = CURRENT_DATE WHERE id = p_po_id;
END;
$$ LANGUAGE plpgsql;

-- ─── HELPER FUNCTION: Next PO Number ────────
CREATE OR REPLACE FUNCTION next_po_number()
RETURNS TEXT AS $$
DECLARE
  current_year TEXT;
  last_num INTEGER;
BEGIN
  current_year := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SPLIT_PART(po_number, '-', 3) AS INTEGER)), 0)
  INTO last_num
  FROM purchase_orders
  WHERE po_number LIKE 'PO-' || current_year || '-%';

  RETURN 'PO-' || current_year || '-' || LPAD((last_num + 1)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ─── SEED DATA (optional - remove if you want to start fresh) ─────

INSERT INTO products (name, sku, category, price, cost, stock, reorder_point, unit, image) VALUES
  ('Espresso Machine Pro', 'ESP-PRO-001', 'Machines', 899.99, 420.00, 24, 10, 'pcs', '☕'),
  ('Ceramic Pour-Over Set', 'CER-POR-002', 'Accessories', 64.99, 22.00, 156, 50, 'pcs', '🫖'),
  ('Single Origin Beans (1kg)', 'BEN-SOG-003', 'Coffee', 34.99, 14.00, 3, 100, 'kg', '🫘'),
  ('Precision Grinder X', 'GRN-PRX-004', 'Machines', 349.99, 155.00, 42, 15, 'pcs', '⚙️'),
  ('Bamboo Filter Holder', 'BAM-FLT-005', 'Accessories', 19.99, 5.50, 8, 30, 'pcs', '🎋'),
  ('Milk Frother Deluxe', 'MLK-FRT-006', 'Machines', 129.99, 48.00, 67, 20, 'pcs', '🥛')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO suppliers (name, contact_email, phone, lead_time_days) VALUES
  ('MechaParts Global', 'orders@mechaparts.com', '+1-555-0101', 14),
  ('CeramaCraft Ltd.', 'supply@ceramacraft.co', '+1-555-0202', 21),
  ('Bean Source Direct', 'wholesale@beansource.com', '+1-555-0303', 7)
ON CONFLICT DO NOTHING;
