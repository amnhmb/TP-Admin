-- 1. Create tables
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    total_quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE package_items (
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    PRIMARY KEY (package_id, item_id)
);

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    whatsapp TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE booking_seq START 1;

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_no TEXT UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    rental_date DATE NOT NULL,
    return_date DATE NOT NULL,
    fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup', 'delivery')),
    status TEXT NOT NULL CHECK (status IN ('reserved', 'confirmed', 'out', 'returned', 'cancelled')),
    package_id UUID REFERENCES packages(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bookings_rental_date ON bookings(rental_date);
CREATE INDEX idx_bookings_return_date ON bookings(return_date);
CREATE INDEX idx_bookings_status ON bookings(status);

CREATE TABLE booking_items (
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 1,
    PRIMARY KEY (booking_id, item_id)
);

-- 2. RLS
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can CRUD items" ON items FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can CRUD packages" ON packages FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can CRUD package_items" ON package_items FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can CRUD customers" ON customers FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can CRUD bookings" ON bookings FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can CRUD booking_items" ON booking_items FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 3. Availability Check Function (Stand-alone for UI queries / edits)
CREATE OR REPLACE FUNCTION get_available_quantity(
    p_item_id UUID,
    p_req_start DATE,
    p_req_end DATE,
    p_exclude_booking_id UUID DEFAULT NULL
) RETURNS INT AS $$
DECLARE
    v_total INT;
    v_held INT;
BEGIN
    SELECT total_quantity INTO v_total FROM items WHERE id = p_item_id;
    IF v_total IS NULL THEN RETURN 0; END IF;

    SELECT COALESCE(SUM(bi.quantity), 0) INTO v_held
    FROM booking_items bi
    JOIN bookings b ON b.id = bi.booking_id
    WHERE bi.item_id = p_item_id
      AND b.status IN ('reserved', 'confirmed', 'out')
      AND b.rental_date <= p_req_end
      AND b.return_date >= p_req_start
      AND (p_exclude_booking_id IS NULL OR b.id != p_exclude_booking_id);

    RETURN v_total - v_held;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION get_available_quantity(UUID, DATE, DATE, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_available_quantity(UUID, DATE, DATE, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_available_quantity(UUID, DATE, DATE, UUID) TO authenticated;


-- 4. Atomic Create Booking RPC
-- p_additional_items is an array of JSON objects: [{"item_id": "uuid", "quantity": 1}]
CREATE OR REPLACE FUNCTION create_booking(
    p_customer_id UUID,
    p_rental_date DATE,
    p_return_date DATE,
    p_fulfillment TEXT,
    p_status TEXT,
    p_package_id UUID,
    p_notes TEXT,
    p_additional_items JSONB
) RETURNS UUID AS $$
DECLARE
    v_booking_id UUID;
    v_booking_no TEXT;
    v_item_id UUID;
    v_qty INT;
    v_total_qty INT;
    v_held INT;
    v_seq_val INT;
BEGIN
    -- Create a temp table to aggregate items safely
    CREATE TEMP TABLE tmp_requested_items (
        item_id UUID PRIMARY KEY,
        quantity INT NOT NULL
    ) ON COMMIT DROP;

    -- Add package items if requested
    IF p_package_id IS NOT NULL THEN
        INSERT INTO tmp_requested_items (item_id, quantity)
        SELECT item_id, quantity FROM package_items WHERE package_id = p_package_id;
    END IF;

    -- Add additional items
    IF p_additional_items IS NOT NULL AND jsonb_array_length(p_additional_items) > 0 THEN
        INSERT INTO tmp_requested_items (item_id, quantity)
        SELECT 
            (elem->>'item_id')::UUID, 
            (elem->>'quantity')::INT
        FROM jsonb_array_elements(p_additional_items) AS elem
        ON CONFLICT (item_id) DO UPDATE SET quantity = tmp_requested_items.quantity + EXCLUDED.quantity;
    END IF;

    -- Lock affected items in consistent order to prevent deadlocks
    FOR v_item_id, v_qty IN 
        SELECT item_id, quantity FROM tmp_requested_items ORDER BY item_id
    LOOP
        -- Lock the row
        SELECT total_quantity INTO v_total_qty FROM items WHERE id = v_item_id FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item % not found', v_item_id;
        END IF;

        -- Calculate held stock (excluding this booking is handled if editing, but this is a create function)
        SELECT COALESCE(SUM(bi.quantity), 0) INTO v_held
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.item_id = v_item_id
          AND b.status IN ('reserved', 'confirmed', 'out')
          AND b.rental_date <= p_return_date
          AND b.return_date >= p_rental_date; -- TUNABLE: overlapping meaning same-day turnaround is blocked. Change to > / < for looser constraint.

        IF (v_total_qty - v_held) < v_qty THEN
            RAISE EXCEPTION 'Insufficient availability for item %', v_item_id;
        END IF;
    END LOOP;

    -- Generate Booking Number (TP-YYMMDD-NNNN)
    SELECT nextval('booking_seq') INTO v_seq_val;
    v_booking_no := 'TP-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(v_seq_val::TEXT, 4, '0');

    -- Insert Booking
    INSERT INTO bookings (booking_no, customer_id, rental_date, return_date, fulfillment, status, package_id, notes)
    VALUES (v_booking_no, p_customer_id, p_rental_date, p_return_date, p_fulfillment, p_status, p_package_id, p_notes)
    RETURNING id INTO v_booking_id;

    -- Insert Booking Items
    INSERT INTO booking_items (booking_id, item_id, quantity)
    SELECT v_booking_id, item_id, quantity FROM tmp_requested_items;

    RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION create_booking(UUID, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_booking(UUID, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION create_booking(UUID, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;
