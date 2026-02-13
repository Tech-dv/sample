-- Migration: Add siding column to wagon_records table
-- This allows each wagon to store its siding information (SPUR-8 or SPUR-9)

-- Add siding column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wagon_records' 
        AND column_name = 'siding'
    ) THEN
        ALTER TABLE wagon_records 
        ADD COLUMN siding TEXT;
        
        COMMENT ON COLUMN wagon_records.siding IS 'Siding information for this wagon (e.g., SPUR-8, SPUR-9)';
        
        -- Populate existing records with siding from dashboard_records
        UPDATE wagon_records wr
        SET siding = (
            SELECT d.siding
            FROM dashboard_records d
            WHERE d.rake_serial_number = wr.rake_serial_number
            AND (d.indent_number IS NULL OR d.indent_number = '' OR d.indent_number = wr.indent_number)
            LIMIT 1
        )
        WHERE wr.siding IS NULL;
        
        -- Create index for faster queries
        CREATE INDEX IF NOT EXISTS idx_wagon_siding ON wagon_records(siding);
    END IF;
END $$;
