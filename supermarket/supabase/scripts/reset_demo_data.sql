-- =============================================================================
-- reset_demo_data.sql: start the store over with a fresh, complete catalogue.
--
-- Run it with:   npx supabase db query --linked -f supabase/scripts/reset_demo_data.sql
-- Then, for sample sales: npx supabase db query --linked -f supabase/scripts/demo_sales.sql
-- (These are one-off data scripts, NOT migrations: `db push` never runs them.)
-- It needs migration 20261102130000_product_brand.sql applied first.
--
-- KEEPS:   every account (auth.users, users), their roles (cashier, admin)
--          and their loyalty accounts and loyalty IDs.
-- DELETES: all sales (orders, order lines, the points audit log), all stock
--          write-offs, all batches and all products.
-- RESETS:  everyone's points to 0 (their history is gone with the sales),
--          and the numbering, so the next order is #1, the next batch B-1
--          and the next product barcode starts again.
-- ADDS:    33 real branded products with SKU, brand, category, price, cost,
--          reorder level, a description and a PHOTO OF THE ACTUAL PRODUCT,
--          each with stock received as batches with an expiry date, through
--          receive_stock() like the Inventory form. A few batches expire
--          within 7 days (sold at 15% off) and one product starts below its
--          reorder level, to show both features.
--
-- Everything happens in ONE transaction: if any step fails, nothing changes.
-- Expiry dates are counted from today in Philippine time, so the script
-- gives the same picture whenever it's run.
-- =============================================================================

begin;

-- receive_stock() only works for admins, so act as the first admin.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select user_id from public.admin order by created_at limit 1), 'role', 'authenticated')::text,
  true
);

-- 1. Remove sales, write-offs, stock and products (children before parents).
delete from public.loyalty_logs;
delete from public.order_items;
delete from public.orders;
delete from public.spoilage_logs;
delete from public.product_batches;
delete from public.products;

-- 2. Points start again from 0.
update public.customer set loyalty_points = 0;

-- 3. Numbering starts again (orders #1, batch B-1, first barcode, …).
alter sequence public.orders_id_seq restart with 1;
alter sequence public.order_items_id_seq restart with 1;
alter sequence public.loyalty_log_id_seq restart with 1;
alter sequence public.spoilage_logs_id_seq restart with 1;
alter sequence public.product_batches_id_seq restart with 1;
alter sequence public.product_batch_code_seq restart with 1;
alter sequence public.products_id_seq restart with 1;
alter sequence public.store_barcode_seq restart with 1;

-- 4. The catalogue. stock_quantity starts at 0: the stock arrives in step 5
--    as batches with expiry dates. Barcodes are given by the database.
--    Name, size and flavour match each product's photo.
insert into public.products (sku, name, brand, category, price, cost, stock_quantity, reorder_level, description) values
  -- Fruits & Vegetables
  ('FV-BANANA-1KG',        'Cavendish Banana (1 kg)',                    'Dole',             'Fruits & Vegetables', 110.00,  80.00, 0, 10, 'Sweet, ready-to-eat Cavendish bananas. About 6 to 7 pieces per kilo.'),
  -- Dairy
  ('DY-YAKULT-5X80ML',     'Probiotic Drink (5 × 80 ml)',                'Yakult',           'Dairy',                60.00,  48.00, 0, 12, 'Cultured milk drink with billions of live Lactobacillus casei Shirota. Keep refrigerated.'),
  -- Bakery
  ('BK-WHITEBREAD-600G',   'Classic White Bread (600 g)',                'Gardenia',         'Bakery',               85.00,  68.00, 0, 10, 'Soft, fluffy sliced white bread. Best eaten within 5 days.'),
  ('BK-WHEATBREAD-400G',   'High Fiber Wheat Bread (400 g)',             'Gardenia',         'Bakery',               98.00,  78.00, 0,  8, 'Sliced wheat bread, high in fibre. Best eaten within 5 days.'),
  -- Beverages
  ('BV-COKE-290ML',        'Coke Original (290 ml glass bottle)',        'Coca-Cola',        'Beverages',            25.00,  18.00, 0, 24, 'The original refreshing cola in the classic returnable glass bottle. Best served ice cold.'),
  ('BV-SPRITE-290ML',      'Lemon-Lime Soda (290 ml glass bottle)',      'Sprite',           'Beverages',            25.00,  18.00, 0, 24, 'Crisp, clear lemon-lime soda in a glass bottle. Caffeine-free.'),
  ('BV-7UP-290ML',         'Lemon-Lime Soda (290 ml glass bottle)',      '7UP',              'Beverages',            25.00,  18.00, 0, 24, 'Light, bubbly lemon-lime soda in the green glass bottle.'),
  ('BV-MTNDEW-500ML',      'Citrus Soda (500 ml)',                       'Mountain Dew',     'Beverages',            35.00,  27.00, 0, 20, 'Bold citrus-flavoured soda with caffeine.'),
  ('BV-REDBULL-250ML',     'Energy Drink (250 ml can)',                  'Red Bull',         'Beverages',            75.00,  58.00, 0, 24, 'Energy drink with caffeine, taurine and B vitamins.'),
  ('BV-GATORADE-591ML',    'Zero Sugar Thirst Quencher (591 ml)',        'Gatorade',         'Beverages',            55.00,  42.00, 0, 18, 'Electrolyte sports drink with zero sugar, for rehydrating after exercise.'),
  ('BV-PINEJUICE-240ML',   '100% Pineapple Juice (240 ml can)',          'Del Monte',        'Beverages',            40.00,  31.00, 0, 24, 'Pure pineapple juice with no added sugar, rich in vitamin C.'),
  ('BV-MILO-400G',         'Chocolate Malt Drink (400 g tin)',           'Milo',             'Beverages',           210.00, 170.00, 0, 10, 'Chocolate malt powder. Mix with hot or cold milk or water.'),
  -- Snacks
  ('SN-SKYFLAKES-250G',    'SkyFlakes Crackers (10 × 25 g)',             'M.Y. San',         'Snacks',               68.00,  54.00, 0, 15, 'Light, crispy saltine crackers in 10 handy single-serve packs.'),
  ('SN-REBISCO-320G',      'Crackers (10 × 32 g)',                       'Rebisco',          'Snacks',               72.00,  57.00, 0, 15, 'Golden, lightly salted crackers in single-serve packs. Great with coffee.'),
  ('SN-OREO-133G',         'Original Sandwich Cookies (133 g)',          'Oreo',             'Snacks',               45.00,  35.00, 0, 20, 'Chocolate cookies with a sweet vanilla creme filling. Twist, lick, dunk.'),
  ('SN-PRINGLES-107G',     'Sour Cream & Onion (107 g)',                 'Pringles',         'Snacks',              119.00,  95.00, 0, 12, 'Stackable potato crisps with sour cream and onion flavour, in the resealable can.'),
  ('SN-TOBLERONE-100G',    'Swiss Milk Chocolate (100 g)',               'Toblerone',        'Snacks',              150.00, 120.00, 0, 10, 'Swiss milk chocolate with honey and almond nougat, in the famous triangle bar.'),
  ('SN-HERSHEYS-43G',      'Milk Chocolate Bar (43 g)',                  'Hershey''s',       'Snacks',               75.00,  58.00, 0, 15, 'Classic smooth and creamy milk chocolate bar.'),
  -- Pantry
  ('PN-PANCITCANTON-60G',  'Pancit Canton Original (60 g)',              'Lucky Me!',        'Pantry',               18.00,  14.00, 0, 40, 'Instant stir-fried noodles with the classic sweet-savoury sauce. Ready in 3 minutes.'),
  ('PN-CUPNOODLES-60G',    'Cup Noodles Seafood (60 g)',                 'Nissin',           'Pantry',               42.00,  33.00, 0, 24, 'Instant noodles in a cup with seafood flavour. Add hot water, wait 3 minutes.'),
  ('PN-VINEGAR-1L',        'Cane Vinegar (1 L)',                         'Datu Puti',        'Pantry',               52.00,  40.00, 0, 12, 'Sharp, clear cane vinegar for adobo, paksiw and dipping sauces.'),
  ('PN-KIKKOMAN-150ML',    'Naturally Brewed Soy Sauce (150 ml)',        'Kikkoman',         'Pantry',               95.00,  75.00, 0, 10, 'Traditionally brewed soy sauce in the table dispenser bottle.'),
  ('PN-KETCHUP-300G',      'Tomato Ketchup (300 g)',                     'Heinz',            'Pantry',               89.00,  70.00, 0, 12, 'Thick, rich tomato ketchup made from sun-ripened tomatoes.'),
  ('PN-BANANACATSUP-320G', 'Banana Catsup (320 g)',                      'UFC',              'Pantry',               38.00,  29.00, 0, 20, 'The Filipino favourite: sweet, tangy banana catsup for fried chicken and spaghetti.'),
  ('PN-SPAM-340G',         'Spam Classic (340 g)',                       'Hormel',           'Pantry',              245.00, 200.00, 0,  8, 'Classic luncheon meat. Slice and fry for breakfast with rice and egg.'),
  ('PN-SARDINES-155G',     'Sardines in Tomato Sauce (155 g)',           '555',              'Pantry',               26.00,  20.00, 0, 30, 'Sardines in tomato sauce. Ready to eat, or sauté with garlic and onion.'),
  ('PN-NUTELLA-350G',      'Hazelnut Spread with Cocoa (350 g)',         'Nutella',          'Pantry',              285.00, 235.00, 0,  8, 'Creamy hazelnut spread with cocoa, for bread, pancakes and desserts.'),
  -- Household
  ('HH-TIDE-1360ML',       'Original Liquid Detergent (1.36 L)',         'Tide',             'Household',           420.00, 345.00, 0,  6, 'Liquid laundry detergent that removes tough stains in one wash.'),
  ('HH-ARIEL-1L',          'Color Liquid Detergent (1 L)',               'Ariel',            'Household',           260.00, 210.00, 0,  8, 'Liquid detergent that cleans deep while keeping coloured clothes bright.'),
  -- Personal Care
  ('PC-SAFEGUARD-130G',    'Pure White Bath Soap (130 g)',               'Safeguard',        'Personal Care',        52.00,  40.00, 0, 20, 'Antibacterial bath soap for the whole family.'),
  ('PC-DOVE-100G',         'Beauty Bar (100 g)',                         'Dove',             'Personal Care',        65.00,  50.00, 0, 15, 'Gentle beauty bar with ¼ moisturising cream that cares for skin.'),
  ('PC-COLGATE-150G',      'Great Regular Flavor Toothpaste (150 g)',    'Colgate',          'Personal Care',       115.00,  90.00, 0, 12, 'Fluoride toothpaste that fights cavities and freshens breath.'),
  ('PC-SHAMPOO-340ML',     'Moisture Anti-Dandruff Shampoo (340 ml)',    'Head & Shoulders', 'Personal Care',       285.00, 230.00, 0,  8, 'Anti-dandruff shampoo that moisturises the scalp and leaves hair flake-free.');

-- 4b. Photos: photos of the actual products, shipped with the app itself in
--     public/products (named after each SKU in lower case, e.g.
--     /products/fv-banana-1kg.jpg), so they load from the app's own address.
--     They're free-licensed photos from Wikimedia Commons;
--     public/products/CREDITS.md credits each one. A photo can still be
--     replaced later from Inventory's Edit form.
update public.products set image_url = '/products/' || lower(sku) || '.jpg';

-- 5. Stock: each delivery is received as a batch with its expiry date
--    (days_left = days from today, Philippine time). Batches expiring within
--    7 days are sold at 15% off (bananas, bread, Yakult). Nutella starts
--    with 5, below its reorder level of 8, so it shows "Low stock".
with deliveries(sku, quantity, days_left) as (
  values
    ('FV-BANANA-1KG',        30,   4),
    ('DY-YAKULT-5X80ML',     12,   5),
    ('DY-YAKULT-5X80ML',     24,  21),
    ('BK-WHITEBREAD-600G',   12,   3),
    ('BK-WHITEBREAD-600G',   20,   6),
    ('BK-WHEATBREAD-400G',   15,   6),
    ('BV-COKE-290ML',        72, 180),
    ('BV-SPRITE-290ML',      60, 180),
    ('BV-7UP-290ML',         60, 180),
    ('BV-MTNDEW-500ML',      48, 150),
    ('BV-REDBULL-250ML',     48, 365),
    ('BV-GATORADE-591ML',    36, 270),
    ('BV-PINEJUICE-240ML',   48, 300),
    ('BV-MILO-400G',         20, 365),
    ('SN-SKYFLAKES-250G',    30, 200),
    ('SN-REBISCO-320G',      30, 200),
    ('SN-OREO-133G',         40, 240),
    ('SN-PRINGLES-107G',     24, 300),
    ('SN-TOBLERONE-100G',    20, 365),
    ('SN-HERSHEYS-43G',      30, 365),
    ('PN-PANCITCANTON-60G', 100, 210),
    ('PN-CUPNOODLES-60G',    48, 240),
    ('PN-VINEGAR-1L',        24, 540),
    ('PN-KIKKOMAN-150ML',    20, 540),
    ('PN-KETCHUP-300G',      24, 365),
    ('PN-BANANACATSUP-320G', 40, 365),
    ('PN-SPAM-340G',         20, 900),
    ('PN-SARDINES-155G',     60, 730),
    ('PN-NUTELLA-350G',       5, 300),
    ('HH-TIDE-1360ML',       12, 730),
    ('HH-ARIEL-1L',          15, 730),
    ('PC-SAFEGUARD-130G',    40, 900),
    ('PC-DOVE-100G',         30, 900),
    ('PC-COLGATE-150G',      24, 730),
    ('PC-SHAMPOO-340ML',     15, 730)
)
select public.receive_stock(
         p.id::integer,
         d.quantity,
         (now() at time zone 'Asia/Manila')::date + d.days_left
       )
  from deliveries d
  join public.products p on p.sku = d.sku
 order by p.id, d.days_left;

-- 6. What's there now (shown when the script finishes).
select (select count(*) from public.products)                           as products,
       (select count(*) from public.product_batches)                    as batches,
       (select sum(stock_quantity) from public.products)                as units_in_stock,
       (select count(*) from public.orders)                             as orders,
       (select count(*) from public.users)                              as accounts_kept,
       (select count(*) from public.admin) + (select count(*) from public.cashier) as staff_roles_kept;

commit;
