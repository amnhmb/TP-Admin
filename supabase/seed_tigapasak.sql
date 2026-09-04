-- Seed: Tiga Pasak "Healing Rent" inventory + packages (from the price posters).
-- Idempotent: safe to re-run. Run in the Supabase SQL editor.
--
-- NOTES:
--  * total_quantity is a PLACEHOLDER (10). Adjust each item to real stock in the
--    Inventory page (bookings/availability depend on it).
--  * The poster RM prices are NOT stored - the schema has no price column yet.
--    (If you want pricing, we add a price column + UI separately.)
--  * "Windshield x1 + Stove x1" in the Tuah package maps to the combo item
--    "Stove + Windshield". "Stove (free)" in Jebat maps to "Stove Sahaja".

-- 1. Items (per-unit rental list) --------------------------------------------
INSERT INTO items (name, total_quantity) VALUES
  ('Kerusi Healing', 10),
  ('Stove + Windshield', 10),
  ('Stove Sahaja', 10),
  ('Camping Bed', 10),
  ('Meja Lipat', 10),
  ('Cooking Set', 10),
  ('Portable Fan', 10),
  ('Table Fan', 10),
  ('Portable Lamp A', 10),
  ('Portable Lamp B', 10),
  ('Ice Box', 10),
  ('Extension (5m)', 10),
  ('Ground Sheet', 10),
  ('Flysheet (1-4 Org)', 10),
  ('UtanKing (1-3 Org)', 10),
  ('Velocity Tent (2-4 Pax)', 10),
  ('Stove Gas', 10),
  ('Foldable Wagon', 10),
  ('Vidalido Tent (2-5 Pax)', 10)
ON CONFLICT (name) DO NOTHING;

-- 2. Packages ----------------------------------------------------------------
INSERT INTO packages (name) VALUES
  ('Kasturi'),
  ('Jebat'),
  ('Tuah'),
  ('Lekir')
ON CONFLICT (name) DO NOTHING;

-- 3. Package contents (resolved by name) -------------------------------------
INSERT INTO package_items (package_id, item_id, quantity)
SELECT p.id, i.id, v.qty
FROM (VALUES
  -- Kasturi (RM30)
  ('Kasturi', 'Kerusi Healing', 2),
  ('Kasturi', 'Meja Lipat', 1),
  -- Jebat 2-4 Pax (RM120)
  ('Jebat', 'Velocity Tent (2-4 Pax)', 1),
  ('Jebat', 'Kerusi Healing', 2),
  ('Jebat', 'Meja Lipat', 1),
  ('Jebat', 'Stove Sahaja', 1),
  ('Jebat', 'Stove Gas', 1),
  ('Jebat', 'Ground Sheet', 1),
  -- Tuah 1-3 Pax (RM90, recommended)
  ('Tuah', 'UtanKing (1-3 Org)', 1),
  ('Tuah', 'Meja Lipat', 1),
  ('Tuah', 'Kerusi Healing', 2),
  ('Tuah', 'Stove + Windshield', 1),
  ('Tuah', 'Stove Gas', 1),
  ('Tuah', 'Cooking Set', 1),
  ('Tuah', 'Foldable Wagon', 1),
  ('Tuah', 'Portable Lamp A', 1),
  ('Tuah', 'Ground Sheet', 1),
  ('Tuah', 'Portable Fan', 1),
  -- Lekir 2-5 Pax (RM130)
  ('Lekir', 'Vidalido Tent (2-5 Pax)', 1),
  ('Lekir', 'Meja Lipat', 1),
  ('Lekir', 'Kerusi Healing', 2),
  ('Lekir', 'Ground Sheet', 1),
  ('Lekir', 'Portable Lamp A', 1)
) AS v(pkg, item, qty)
JOIN packages p ON p.name = v.pkg
JOIN items i ON i.name = v.item
ON CONFLICT (package_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;
