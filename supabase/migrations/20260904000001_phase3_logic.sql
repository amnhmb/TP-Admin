-- Phase 3 Logic Updates

-- 1. Add CHECK constraints to prevent zero or negative quantities
ALTER TABLE items ADD CONSTRAINT items_quantity_check CHECK (total_quantity > 0);
ALTER TABLE package_items ADD CONSTRAINT package_items_quantity_check CHECK (quantity > 0);
ALTER TABLE booking_items ADD CONSTRAINT booking_items_quantity_check CHECK (quantity > 0);

-- 2. Drop the old create_booking function (since signature changes)
DROP FUNCTION IF EXISTS create_booking(UUID, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB);

-- 3. Replace create_booking to fold in customer upsert atomically
CREATE OR REPLACE FUNCTION create_booking(
    p_customer_name TEXT,
    p_customer_whatsapp TEXT,
    p_rental_date DATE,
    p_return_date DATE,
    p_fulfillment TEXT,
    p_status TEXT,
    p_package_id UUID,
    p_notes TEXT,
    p_additional_items JSONB
) RETURNS UUID AS $$
DECLARE
    v_customer_id UUID;
    v_booking_id UUID;
    v_booking_no TEXT;
    v_item_id UUID;
    v_qty INT;
    v_total_qty INT;
    v_held INT;
    v_seq_val INT;
BEGIN
    -- Upsert customer securely
    INSERT INTO customers (name, whatsapp) 
    VALUES (p_customer_name, p_customer_whatsapp)
    ON CONFLICT (whatsapp) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_customer_id;

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

        -- Calculate held stock
        SELECT COALESCE(SUM(bi.quantity), 0) INTO v_held
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.item_id = v_item_id
          AND b.status IN ('reserved', 'confirmed', 'out')
          AND b.rental_date <= p_return_date
          AND b.return_date >= p_rental_date;

        IF (v_total_qty - v_held) < v_qty THEN
            RAISE EXCEPTION 'Insufficient availability for item %', v_item_id;
        END IF;
    END LOOP;

    -- Generate Booking Number (TP-YYMMDD-NNNN)
    SELECT nextval('booking_seq') INTO v_seq_val;
    v_booking_no := 'TP-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(v_seq_val::TEXT, 4, '0');

    -- Insert Booking
    INSERT INTO bookings (booking_no, customer_id, rental_date, return_date, fulfillment, status, package_id, notes)
    VALUES (v_booking_no, v_customer_id, p_rental_date, p_return_date, p_fulfillment, p_status, p_package_id, p_notes)
    RETURNING id INTO v_booking_id;

    -- Insert Booking Items
    INSERT INTO booking_items (booking_id, item_id, quantity)
    SELECT v_booking_id, item_id, quantity FROM tmp_requested_items;

    RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION create_booking(TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_booking(TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION create_booking(TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- 4. Create update_booking (exclude-self overlap logic)
CREATE OR REPLACE FUNCTION update_booking(
    p_booking_id UUID,
    p_customer_name TEXT,
    p_customer_whatsapp TEXT,
    p_rental_date DATE,
    p_return_date DATE,
    p_fulfillment TEXT,
    p_status TEXT,
    p_package_id UUID,
    p_notes TEXT,
    p_additional_items JSONB
) RETURNS VOID AS $$
DECLARE
    v_customer_id UUID;
    v_item_id UUID;
    v_qty INT;
    v_total_qty INT;
    v_held INT;
BEGIN
    -- Upsert customer securely
    INSERT INTO customers (name, whatsapp) 
    VALUES (p_customer_name, p_customer_whatsapp)
    ON CONFLICT (whatsapp) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_customer_id;

    CREATE TEMP TABLE tmp_update_req_items (
        item_id UUID PRIMARY KEY,
        quantity INT NOT NULL
    ) ON COMMIT DROP;

    IF p_package_id IS NOT NULL THEN
        INSERT INTO tmp_update_req_items (item_id, quantity)
        SELECT item_id, quantity FROM package_items WHERE package_id = p_package_id;
    END IF;

    IF p_additional_items IS NOT NULL AND jsonb_array_length(p_additional_items) > 0 THEN
        INSERT INTO tmp_update_req_items (item_id, quantity)
        SELECT (elem->>'item_id')::UUID, (elem->>'quantity')::INT
        FROM jsonb_array_elements(p_additional_items) AS elem
        ON CONFLICT (item_id) DO UPDATE SET quantity = tmp_update_req_items.quantity + EXCLUDED.quantity;
    END IF;

    FOR v_item_id, v_qty IN 
        SELECT item_id, quantity FROM tmp_update_req_items ORDER BY item_id
    LOOP
        SELECT total_quantity INTO v_total_qty FROM items WHERE id = v_item_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Item % not found', v_item_id; END IF;

        -- Skip availability check if we are just marking it returned/cancelled (releasing stock)
        IF p_status NOT IN ('returned', 'cancelled') THEN
            -- Exclude the CURRENT booking from the overlap calculation
            SELECT COALESCE(SUM(bi.quantity), 0) INTO v_held
            FROM booking_items bi
            JOIN bookings b ON b.id = bi.booking_id
            WHERE bi.item_id = v_item_id
              AND b.status IN ('reserved', 'confirmed', 'out')
              AND b.rental_date <= p_return_date
              AND b.return_date >= p_rental_date
              AND b.id != p_booking_id;

            IF (v_total_qty - v_held) < v_qty THEN
                RAISE EXCEPTION 'Insufficient availability for item %', v_item_id;
            END IF;
        END IF;
    END LOOP;

    -- Update Booking
    UPDATE bookings SET
        customer_id = v_customer_id,
        rental_date = p_rental_date,
        return_date = p_return_date,
        fulfillment = p_fulfillment,
        status = p_status,
        package_id = p_package_id,
        notes = p_notes
    WHERE id = p_booking_id;

    -- Replace items
    DELETE FROM booking_items WHERE booking_id = p_booking_id;
    
    INSERT INTO booking_items (booking_id, item_id, quantity)
    SELECT p_booking_id, item_id, quantity FROM tmp_update_req_items;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION update_booking(UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_booking(UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION update_booking(UUID, TEXT, TEXT, DATE, DATE, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- 5. Lightweight Status Update RPC
CREATE OR REPLACE FUNCTION set_booking_status(
    p_booking_id UUID,
    p_status TEXT
) RETURNS VOID AS $$
BEGIN
    IF p_status NOT IN ('reserved', 'confirmed', 'out', 'returned', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;

    UPDATE bookings 
    SET status = p_status 
    WHERE id = p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION set_booking_status(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_booking_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION set_booking_status(UUID, TEXT) TO authenticated;
