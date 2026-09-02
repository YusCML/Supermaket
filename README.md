# Supermarket Express

A supermarket management application with a point-of-sale screen, inventory management, and customer loyalty tracking. The frontend is a React app backed by Supabase.

## Features

- Process POS checkouts with cash, card, or loyalty points
- Search products by name, SKU, or barcode
- Add products and monitor stock levels and reorder levels
- View customers, loyalty balances, and loyalty activity
- Persist products, orders, order items, customers, and loyalty logs in Supabase

## Tech Stack

- React 18
- Create React App / `react-scripts`
- Supabase and PostgreSQL
- Supabase CLI for database migrations and generated TypeScript types

## Project Structure

```text
supermarket/
├── src/
│   ├── App.jsx                 # Main application state and navigation
│   ├── components/
│   │   ├── POS.jsx             # Checkout workflow
│   │   ├── Inventory.jsx       # Product and stock management
│   │   ├── Loyalty.jsx         # Customers and loyalty activity
│   │   └── services/           # Supabase API client and data access
│   └── types/supabase.ts       # Generated Supabase types
├── db/schema.sql               # Reference database schema
└── supabase/migrations/        # Supabase migration files
```

## Prerequisites

- Node.js 18 or newer
- npm
- A Supabase project
- Supabase CLI, if you need to apply migrations or generate types

## Getting Started

From the repository root, enter the application directory and install dependencies:

```bash
cd supermarket
npm install
```

Create a `.env.local` file in `supermarket/` with your Supabase project credentials:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

The client also accepts `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as fallbacks.

Apply the database schema or migrations, then start the development server:

```bash
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm test` | Run the test suite |
| `npm run db:push` | Push local Supabase migrations |
| `npm run db:pull` | Pull the linked database schema |
| `npm run gen-types` | Generate TypeScript types from Supabase |

## Database

The data model includes these tables:

- `products`
- `customers`
- `orders`
- `order_items`
- `loyalty_logs`

Checkout processing uses the Supabase `process_pos_checkout` RPC. Ensure that the function and its related database permissions are available in the configured Supabase project before testing checkout.

For a standalone SQL reference, see [`supermarket/db/schema.sql`](supermarket/db/schema.sql). Supabase migrations are stored in [`supermarket/supabase/migrations`](supermarket/supabase/migrations).

## Development Notes

- The app loads products, customers, and loyalty logs when it starts.
- Changes made through checkout or inventory management refresh the displayed data after the request completes.
- Never commit `.env.local` or expose a Supabase service-role key in the frontend. Use only the public anon key in browser environment variables.