-- Migration: Add customer_id column to wagon_records table for multiple indent support
-- This allows each wagon to have its own customer when not in single indent mode

-- Add customer_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wagon_records' 
        AND column_name = 'customer_id'
    ) THEN
        ALTER TABLE wagon_records 
        ADD COLUMN customer_id INTEGER REFERENCES customers(id);
        
        COMMENT ON COLUMN wagon_records.customer_id IS 'Customer ID for this wagon (used in multiple indent mode)';
    END IF;
END $$;

