# MRP Inventory System

A production-ready Manufacturing Resource Planning (MRP) and Inventory Management system built with **Next.js 14**, **Supabase**, and **Tailwind CSS**. Inspired by Katana MRP — built to replace it.

![Stack](https://img.shields.io/badge/Next.js-14-black) ![Stack](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E) ![Stack](https://img.shields.io/badge/Tailwind-3.4-38BDF8) ![Stack](https://img.shields.io/badge/TypeScript-5.3-3178C6)

## Features

- **📦 Inventory Management** — Full CRUD for products with SKU, categories, stock levels, reorder alerts
- **📋 Purchase Orders** — Create POs with multi-line items, assign to suppliers, manage draft → ordered → received workflow
- **⇅ Stock Movements** — Track every inbound/outbound movement with references and auto-stock updates
- **◎ Supplier Management** — Manage suppliers with lead times, contact info, and linked PO history
- **◉ Dashboard** — Real-time stats, low stock alerts, inventory value, recent activity, and visual stock charts
- **🔄 Auto-Receive** — Receiving a PO automatically increases product stock and logs movements (via PostgreSQL function)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, DM Sans/DM Mono fonts |
| Database | Supabase (PostgreSQL) |
| Notifications | react-hot-toast |
| Icons | Lucide React |

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/mrp-inventory-system.git
cd mrp-inventory-system
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project (free tier works fine)
2. Once your project is created, go to **SQL Editor** in the Supabase dashboard
3. Copy the entire contents of `supabase/schema.sql` and paste it into the SQL Editor
4. Click **Run** — this creates all tables, indexes, functions, and seed data

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:
- **Project URL**: Found in Supabase → Settings → API → Project URL
- **Anon Key**: Found in Supabase → Settings → API → `anon` `public` key

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the dashboard with seed data.

---

## Project Structure

```
mrp-inventory-system/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout with sidebar
│   │   ├── page.tsx            # Redirect to /dashboard
│   │   ├── globals.css         # Global styles + Tailwind
│   │   ├── dashboard/page.tsx  # Dashboard with stats & charts
│   │   ├── inventory/page.tsx  # Product inventory CRUD
│   │   ├── purchase-orders/page.tsx  # PO management
│   │   ├── stock-movements/page.tsx  # Stock tracking
│   │   └── suppliers/page.tsx  # Supplier management
│   ├── components/
│   │   ├── ui/index.tsx        # Reusable UI components
│   │   └── layout/
│   │       ├── Sidebar.tsx     # Navigation sidebar
│   │       └── Header.tsx      # Page header with alerts
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client
│   │   ├── data.ts            # Data access functions
│   │   └── utils.ts           # Utility helpers
│   └── types/
│       └── database.ts        # TypeScript types
├── supabase/
│   └── schema.sql             # Database schema + seed data
├── .env.example               # Environment template
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Database Schema

```
products          — Inventory items with SKU, stock, pricing
suppliers         — Vendor/supplier records
purchase_orders   — PO headers with status workflow
po_line_items     — PO line items linked to products
stock_movements   — Inbound/outbound stock tracking
bom               — Bill of Materials headers
bom_components    — BOM material components
```

Key PostgreSQL functions:
- `receive_purchase_order(po_id)` — Atomically receives a PO: updates stock, creates movements, marks PO received
- `next_po_number()` — Auto-generates sequential PO numbers (PO-YYYY-NNNN)

---

## Deploying to Production

### Vercel (recommended)

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com), import the repo
3. Add your environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy — done!

### Adding Authentication (recommended for production)

To add user auth, integrate Supabase Auth:

1. Enable auth providers in Supabase → Authentication → Providers
2. Install `@supabase/auth-helpers-nextjs`
3. Add middleware for session management
4. Update RLS policies to use `auth.uid()` instead of `true`

---

## Pushing to GitHub

```bash
# Initialize git
git init
git add .
git commit -m "Initial commit - MRP Inventory System"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/mrp-inventory-system.git
git branch -M main
git push -u origin main
```

---

## Roadmap

- [ ] Add Supabase Auth (login/signup)
- [ ] Role-based access (admin, warehouse, viewer)
- [ ] Bill of Materials full CRUD
- [ ] Manufacturing Orders
- [ ] Sales Orders / outbound fulfillment
- [ ] CSV import/export
- [ ] Barcode scanning
- [ ] Email notifications for low stock
- [ ] Audit log / activity history
- [ ] Multi-warehouse support

---

## License

MIT — use it, modify it, ship it.
