-- Replace create_booking with max sequence logic
CREATE OR REPLACE FUNCTION create_booking(
    p_customer_name TEXT,
    p_customer_whatsapp TEXT,
    p_rental_date DATE,
    p_return_date DATE,
    p_fulfillment TEXT,
    p_status TEXT,
    p_package_id UUID,
    p_notes TEXT,
    p_additional_items JSONB,
    p_booking_no TEXT DEFAULT NULL
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

    -- Booking Number Logic: continue from highest existing number (manual entries counted)
    IF p_booking_no IS NULL OR TRIM(p_booking_no) = '' THEN
        -- serialize allocation so two concurrent inserts cannot pick the same number
        PERFORM pg_advisory_xact_lock(hashtext('booking_no_alloc'));
        SELECT COALESCE(MAX((substring(booking_no from '(\d+)$'))::int), 0) + 1
        INTO v_seq_val
        FROM bookings
        WHERE booking_no ~ '\d+$';
        v_booking_no := 'TP-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(v_seq_val::TEXT, 4, '0');
    ELSE
        v_booking_no := TRIM(p_booking_no);
    END IF;

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
