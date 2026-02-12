-- Trigger to update ONLY rake_serial_number when bag counting starts
-- Uses only rake_serial_number (train_id removed from all tables except train_session)

DROP TRIGGER IF EXISTS trigger_assign_sequential_train_id ON wagon_records;
DROP FUNCTION IF EXISTS assign_sequential_train_id_on_count();

CREATE OR REPLACE FUNCTION assign_sequential_train_id_on_count()
RETURNS TRIGGER AS $$
DECLARE
  v_rake_serial_number TEXT;
  v_indent_number TEXT;
  v_has_sequential_serials BOOLEAN;
  v_base_rake_serial TEXT;
  v_current_rake_serial TEXT;
  v_new_rake_serial TEXT;
  v_financial_year TEXT;
  v_month TEXT;
  v_sequence INTEGER;
  v_attempts INTEGER := 0;
  v_check_exists INTEGER;
BEGIN
  -- Only process if loaded_bag_count changed from 0/NULL to > 0
  IF (NEW.loaded_bag_count IS NULL OR NEW.loaded_bag_count <= 0) OR 
     (OLD.loaded_bag_count IS NOT NULL AND OLD.loaded_bag_count > 0) THEN
    RETURN NEW;
  END IF;

  v_rake_serial_number := NEW.rake_serial_number;
  v_indent_number := NEW.indent_number;

  -- Skip if no indent_number (single indent mode)
  IF v_indent_number IS NULL OR v_indent_number = '' THEN
    RETURN NEW;
  END IF;

  -- ✅ FIX: Get the base rake_serial_number from train_session FIRST
  -- This is needed to check if splitting has been initiated
  -- The NEW.rake_serial_number might already be a sequential number if splitting happened
  SELECT rake_serial_number INTO v_base_rake_serial
  FROM train_session
  WHERE rake_serial_number = v_rake_serial_number
     OR rake_serial_number = (
       -- Also check if v_rake_serial_number is a sequential number (e.g., 2025-26/02/001-1)
       -- Extract base by removing the sequential suffix
       SELECT regexp_replace(v_rake_serial_number, '-\\d+$', '')
     )
  LIMIT 1;

  -- If we can't find base, try to extract it from the rake_serial_number pattern
  IF v_base_rake_serial IS NULL THEN
    -- Try to extract base from sequential pattern (e.g., 2025-26/02/001-1 -> 2025-26/02/001)
    IF v_rake_serial_number ~ '-\\d+$' THEN
      v_base_rake_serial := regexp_replace(v_rake_serial_number, '-\\d+$', '');
    ELSE
      v_base_rake_serial := v_rake_serial_number;
    END IF;
  END IF;

  -- ✅ FIX: Check if has_sequential_serials flag is TRUE
  -- AND check if splitting has already been initiated (sequential rake_serial_numbers exist)
  -- This prevents the trigger from splitting during Save operations
  -- Splitting is only initiated when user clicks Proceed -> Yes (generateMultipleRakeSerial)
  SELECT has_sequential_serials INTO v_has_sequential_serials
  FROM dashboard_records
  WHERE rake_serial_number = v_base_rake_serial
     OR rake_serial_number = v_rake_serial_number
  LIMIT 1;

  IF NOT v_has_sequential_serials THEN
    RETURN NEW;
  END IF;

  -- ✅ FIX: Check if splitting has already been initiated by generateMultipleRakeSerial
  -- If all dashboard_records still use the same base rake_serial_number, splitting hasn't happened yet
  -- Only proceed with trigger logic if sequential rake_serial_numbers already exist
  -- This prevents automatic splitting during Save - splitting only happens when user explicitly chooses it
  SELECT COUNT(DISTINCT rake_serial_number) INTO v_check_exists
  FROM dashboard_records
  WHERE (rake_serial_number = v_base_rake_serial 
         OR rake_serial_number LIKE v_base_rake_serial || '-%')
    AND indent_number IS NOT NULL
    AND indent_number != '';

  -- If only one unique rake_serial_number exists, splitting hasn't been initiated yet
  -- Don't split during Save - wait for user to click Proceed -> Yes
  IF v_check_exists <= 1 THEN
    RAISE NOTICE 'Splitting not yet initiated for rake_serial_number % (base: %). Skipping trigger (Save operation). User must click Proceed -> Yes first.', v_rake_serial_number, v_base_rake_serial;
    RETURN NEW;
  END IF;

  -- ✅ ADDITIONAL SAFEGUARD: Verify that the current record's rake_serial_number is still the base
  -- If it's already been split (different from base), don't split again
  -- This prevents the trigger from running during Save when records are being updated
  IF v_rake_serial_number != v_base_rake_serial AND v_rake_serial_number NOT LIKE v_base_rake_serial || '-%' THEN
    -- Current record already has a different rake_serial_number (not base, not sequential from this base)
    -- This shouldn't happen, but if it does, skip to prevent errors
    RAISE NOTICE 'Current record rake_serial_number % is not base % and not sequential. Skipping trigger.', v_rake_serial_number, v_base_rake_serial;
    RETURN NEW;
  END IF;

  -- Get current rake_serial_number for this indent (use base to find the record)
  SELECT rake_serial_number INTO v_current_rake_serial
  FROM dashboard_records
  WHERE (rake_serial_number = v_base_rake_serial OR rake_serial_number = v_rake_serial_number)
    AND indent_number = v_indent_number
  LIMIT 1;

  -- If already has unique rake_serial_number (different from base), skip
  IF v_current_rake_serial IS NOT NULL AND v_current_rake_serial != v_base_rake_serial THEN
    RAISE NOTICE 'Indent % already has unique rake_serial_number %', v_indent_number, v_current_rake_serial;
    RETURN NEW;
  END IF;

  -- Check if any OTHER indent has already started counting (loaded_bag_count > 0)
  -- Use base rake_serial_number for the check, not v_rake_serial_number
  -- If no, this is the FIRST indent - keep base rake_serial_number
  -- If yes, this is SUBSEQUENT - needs unique rake_serial_number
  SELECT COUNT(*) INTO v_check_exists
  FROM wagon_records
  WHERE (rake_serial_number = v_base_rake_serial OR rake_serial_number LIKE v_base_rake_serial || '-%')
    AND indent_number != v_indent_number
    AND indent_number IS NOT NULL
    AND indent_number != ''
    AND loaded_bag_count > 0;

  IF v_check_exists = 0 THEN
    -- No other indent has started counting - this is the FIRST indent
    RAISE NOTICE 'Indent % is first starter, keeping base rake_serial_number %', v_indent_number, v_base_rake_serial;
    UPDATE dashboard_records
    SET rake_serial_number = v_base_rake_serial
    WHERE (rake_serial_number = v_base_rake_serial OR rake_serial_number = v_rake_serial_number)
      AND indent_number = v_indent_number;
    
    -- ✅ FIX: Also update wagon_records for this indent to use the base rake_serial_number
    UPDATE wagon_records
    SET rake_serial_number = v_base_rake_serial
    WHERE (rake_serial_number = v_base_rake_serial OR rake_serial_number = v_rake_serial_number)
      AND indent_number = v_indent_number;
    
    RETURN NEW;
  END IF;

  -- This is a SUBSEQUENT indent - generate unique rake_serial_number
  -- Parse base rake_serial_number: YYYY-YY/MM/XXX
  v_financial_year := substring(v_base_rake_serial from '^\d{4}-\d{2}');
  v_month := substring(v_base_rake_serial from '/(\d{2})/');
  v_sequence := substring(v_base_rake_serial from '/(\d+)$')::INTEGER;

  IF v_financial_year IS NULL OR v_month IS NULL OR v_sequence IS NULL THEN
    RAISE NOTICE 'Could not parse rake_serial_number %', v_base_rake_serial;
    RETURN NEW;
  END IF;

  -- Increment sequence and find unique number
  v_sequence := v_sequence + 1;
  WHILE v_attempts < 1000 LOOP
    v_new_rake_serial := v_financial_year || '/' || v_month || '/' || LPAD(v_sequence::TEXT, 3, '0');

    -- Check if this number is already used
    SELECT COUNT(*) INTO v_check_exists
    FROM dashboard_records
    WHERE rake_serial_number = v_new_rake_serial;

    IF v_check_exists = 0 THEN
      -- Also check train_session
      SELECT COUNT(*) INTO v_check_exists
      FROM train_session
      WHERE rake_serial_number = v_new_rake_serial;
  END IF;
  
    IF v_check_exists = 0 THEN
      -- Found unique number
      EXIT;
  END IF;

    v_sequence := v_sequence + 1;
    v_attempts := v_attempts + 1;
  END LOOP;

  -- Update rake_serial_number in dashboard_records (use base to find the record)
  UPDATE dashboard_records
  SET rake_serial_number = v_new_rake_serial
  WHERE (rake_serial_number = v_base_rake_serial OR rake_serial_number = v_rake_serial_number)
    AND indent_number = v_indent_number;

  -- ✅ FIX: Also update wagon_records for this indent to use the new rake_serial_number
  UPDATE wagon_records
  SET rake_serial_number = v_new_rake_serial
  WHERE (rake_serial_number = v_base_rake_serial OR rake_serial_number = v_rake_serial_number)
    AND indent_number = v_indent_number;

  RAISE NOTICE 'Assigned rake_serial_number % to indent % (updated dashboard_records and wagon_records)', v_new_rake_serial, v_indent_number;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_assign_sequential_train_id
AFTER UPDATE OF loaded_bag_count ON wagon_records
FOR EACH ROW
WHEN (NEW.loaded_bag_count IS NOT NULL AND NEW.loaded_bag_count > 0 
      AND (OLD.loaded_bag_count IS NULL OR OLD.loaded_bag_count <= 0))
EXECUTE FUNCTION assign_sequential_train_id_on_count();
