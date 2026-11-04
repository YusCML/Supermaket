# SuperMarket Express: database ERD

The tables in the Supabase `public` schema, plus Supabase's own `auth.users`,
as of 2 Nov 2026, including `products.brand` (migration 20261102130000) and
member phone numbers (`set_member_phone`, migration 20261102140000). GitHub draws the
diagram below automatically; in VS Code, install a Mermaid preview extension
to see it.

Notation (crow's foot): `||` exactly one, `|o` / `o|` zero or one, `o{` zero
or many. PK = primary key, FK = foreign key, UK = unique.

```mermaid
erDiagram
    auth_users ||--o| users : "has profile"
    users ||--o| customer : "loyalty account"
    users ||--o| cashier : "cashier role"
    users ||--o| admin : "admin role"
    users |o--o{ orders : "places"
    users ||--o{ loyalty_logs : "points history"
    orders |o--o{ order_items : "contains"
    orders |o--o{ loyalty_logs : "points earned or spent on"
    products |o--o{ order_items : "sold as"
    product_batches |o--o{ order_items : "sold from"
    products ||--o{ product_batches : "stocked in"
    product_batches ||--o{ spoilage_logs : "written off as"
    products ||--o{ spoilage_logs : "losses"

    auth_users {
        uuid id PK "Supabase sign-in (auth.users)"
    }
    users {
        uuid id PK, FK "= auth.users.id"
        text email
        timestamptz created_at
        varchar name "255"
        varchar phone "20"
        text role "admin / cashier / customer (highest held)"
    }
    customer {
        uuid id PK
        uuid user_id FK, UK
        varchar loyalty_id UK "LOY-000001, given automatically"
        integer loyalty_points "never below 0"
        timestamptz created_at
    }
    cashier {
        uuid id PK
        uuid user_id FK, UK
        timestamptz created_at
    }
    admin {
        uuid id PK
        uuid user_id FK, UK
        timestamptz created_at
    }
    orders {
        bigint id PK
        uuid customer_id FK "users.id"
        numeric total_amount "10,2"
        numeric discount_amount "10,2: points discount"
        numeric final_amount "10,2: what was paid"
        varchar payment_method "Cash / Card / Loyalty Points"
        timestamptz created_at
        integer points_redeemed
    }
    order_items {
        bigint id PK
        bigint order_id FK
        bigint product_id FK
        integer quantity
        numeric unit_price "10,2: price charged"
        numeric subtotal "10,2"
        numeric price "unused, always 0"
        bigint batch_id FK
        numeric list_price "frozen at sale"
        numeric unit_cost "frozen at sale"
        text product_name "frozen at sale"
    }
    loyalty_logs {
        bigint id PK
        uuid customer_id FK "users.id"
        bigint order_id FK
        integer points_changed "negative when redeemed"
        varchar reason "255"
        timestamptz created_at
        varchar type "EARNED / REDEEMED"
    }
    products {
        bigint id PK
        varchar sku UK "100"
        varchar name "255"
        varchar category "100"
        numeric price "10,2"
        numeric cost "10,2: admins only"
        integer stock_quantity
        integer reorder_level
        timestamptz created_at
        timestamptz updated_at
        varchar barcode UK "100, not blank"
        text image_url
        text description "max 300 characters"
        text brand "who makes it, max 60 characters"
    }
    product_batches {
        bigint id PK
        integer product_id FK
        text batch_code UK
        integer quantity_received "greater than 0"
        integer quantity_remaining "0 to quantity_received"
        date expiry_date
        text status "active / expired / spoiled / manual"
        timestamptz received_at
        timestamptz expired_at
        timestamptz created_at
    }
    spoilage_logs {
        bigint id PK
        bigint batch_id FK
        integer product_id FK
        integer quantity "greater than 0"
        numeric unit_cost "10,2"
        numeric loss_amount "12,2"
        timestamptz expired_at
        timestamptz created_at
        text kind "expired / damaged / spoiled"
        text reason "required"
    }
```

## Relationships

| From → to | Through | Cardinality | If the parent is deleted |
|---|---|---|---|
| auth.users → users | `users.id` | 1 : 0..1 | profile deleted too |
| users → customer | `customer.user_id` | 1 : 0..1 | deleted too |
| users → cashier | `cashier.user_id` | 1 : 0..1 | deleted too |
| users → admin | `admin.user_id` | 1 : 0..1 | deleted too |
| users → orders | `orders.customer_id` | 0..1 : 0..* | order kept, member cleared |
| users → loyalty_logs | `loyalty_logs.customer_id` | 1 : 0..* | deleted too |
| orders → order_items | `order_items.order_id` | 0..1 : 0..* | deleted too |
| orders → loyalty_logs | `loyalty_logs.order_id` | 0..1 : 0..* | log kept, order cleared |
| products → order_items | `order_items.product_id` | 0..1 : 0..* | blocked while sold |
| product_batches → order_items | `order_items.batch_id` | 0..1 : 0..* | blocked while sold |
| products → product_batches | `product_batches.product_id` | 1 : 0..* | blocked |
| product_batches → spoilage_logs | `spoilage_logs.batch_id` | 1 : 0..* | blocked |
| products → spoilage_logs | `spoilage_logs.product_id` | 1 : 0..* | blocked |

"0..1" on the parent side means the foreign key column may be empty (null).
`order_items.order_id` and `product_id` allow null in the schema, but
checkout always fills them.

## Reading notes

- **Accounts and roles.** `users` is the app's copy of each Supabase sign-in.
  Everyone gets a `customer` row (their loyalty account); a row in `cashier`
  or `admin` adds that role.
- **Sales point at the account.** `orders.customer_id` and
  `loyalty_logs.customer_id` hold `users.id`, not `customer.id`.
- **Frozen sale lines.** A trigger (`order_items_snapshot_product`) copies
  `list_price`, `unit_cost` and `product_name` into each `order_items` row
  when it's saved, so editing a product later doesn't change past orders or
  profit. `unit_price` is what was actually charged (15% less for near-expiry
  units).
- **Private cost.** Only admins can read `products.cost` (column
  permissions); customers and cashiers see the price only.
- **Stock movement.** A sale lowers `products.stock_quantity` and each
  batch's `quantity_remaining`, soonest expiry first. Expired, damaged or
  spoiled units are recorded in `spoilage_logs` with their cost as the loss.
- **Payment method** is checked by the checkout function
  (`process_pos_checkout_base`), not by a table rule.
- **Unused column.** `order_items.price` is left over from an early version;
  checkout never fills it, so it's always 0.

## Database functions and triggers

The app reaches the tables through these functions; each one checks who is
calling before doing anything.

| Function | Used for | Who may use it |
|---|---|---|
| `process_pos_checkout` | Save a sale all-or-nothing and return the receipt | Customers (own sale only), cashiers, admins |
| `receive_stock` | Add a batch with its expiry date; also used for a new product's starting stock | Admins |
| `write_off_stock` | Remove damaged or spoiled units and log the loss | Admins |
| `process_expired_batches` | Remove expired stock and log the loss (also runs nightly at 12:05 AM Manila) | Admins |
| `get_product_inventory` | Stock, near-expiry units and earliest expiry per product | Signed-in users |
| `get_product_costs` | Product costs | Admins |
| `get_admin_sales_analytics` | Headline sales numbers | Admins |
| `get_profit_loss_series` | Orders, gross sales, costs and net income per hour, day or month | Admins (migration 20261102120000) |
| `get_sales_breakdown` | Payment mix and top products for a date range | Admins (migration 20261102120000) |
| `set_user_roles` | Give or take away the cashier and admin roles | Admins |
| `ensure_my_account` | Make sure a signed-in person has a profile and loyalty account | Signed-in users |
| `set_member_phone` | Save a member's phone number (a PH mobile number, one member per number), so the POS can find them by phone | Staff for any member; anyone for themselves |

| Trigger | On | What it does |
|---|---|---|
| `on_auth_user_created` | new sign-up (`auth.users`) | Sets up the new account (its `users` row and loyalty account) through `setup_customer_account` |
| `users_ensure_profiles` | `users` added or changed | Makes sure there's a `customer` row, plus an `admin` or `cashier` row when `users.role` says so |
| `products_assign_barcode` | `products` added or changed | Gives the product an in-store barcode |
| `products_create_initial_batch` | `products` added | Puts starting stock in a batch with no expiry date. The app no longer uses it: it adds products with 0 stock, then receives the starting stock with its expiry date |
| `order_items_snapshot_product` | `order_items` added | Freezes the line's normal price, cost and product name |
| `order_items_allocate_batches` | `order_items` added | Takes the units off the chosen batch, or the soonest-expiring ones (`consume_product_batches`) |
