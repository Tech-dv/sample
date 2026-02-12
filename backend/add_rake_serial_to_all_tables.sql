-- Migration: Add rake_serial_number column to all tables that reference trains
-- This ensures we can query by both train_id and rake_serial_number for unique lookups

-- Add rake_serial_number to wagon_records
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wagon_records' 
        AND column_name = 'rake_serial_number'
    ) THEN
        ALTER TABLE wagon_records 
        ADD COLUMN rake_serial_number TEXT;
        
        COMMENT ON COLUMN wagon_records.rake_serial_number IS 'Rake serial number for this wagon (e.g., 2025-26/02/001)';
        
        -- Create index for faster queries
        CREATE INDEX IF NOT EXISTS idx_wagon_rake_serial ON wagon_records(rake_serial_number);
        CREATE INDEX IF NOT EXISTS idx_wagon_train_rake ON wagon_records(train_id, rake_serial_number);
    END IF;
END $$;

-- Add rake_serial_number to dispatch_records
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'dispatch_records' 
        AND column_name = 'rake_serial_number'
    ) THEN
        ALTER TABLE dispatch_records 
        ADD COLUMN rake_serial_number TEXT;
        
        COMMENT ON COLUMN dispatch_records.rake_serial_number IS 'Rake serial number for this dispatch record (e.g., 2025-26/02/001)';
        
        -- Create index for faster queries
        CREATE INDEX IF NOT EXISTS idx_dispatch_rake_serial ON dispatch_records(rake_serial_number);
        CREATE INDEX IF NOT EXISTS idx_dispatch_train_rake_indent ON dispatch_records(train_id, rake_serial_number, indent_number);
    END IF;
END $$;

-- Add rake_serial_number to activity_timeline
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'activity_timeline' 
        AND column_name = 'rake_serial_number'
    ) THEN
        ALTER TABLE activity_timeline 
        ADD COLUMN rake_serial_number TEXT;
        
        COMMENT ON COLUMN activity_timeline.rake_serial_number IS 'Rake serial number for this activity entry (e.g., 2025-26/02/001)';
        
        -- Create index for faster queries
        CREATE INDEX IF NOT EXISTS idx_activity_rake_serial ON activity_timeline(rake_serial_number);
        CREATE INDEX IF NOT EXISTS idx_activity_train_rake_indent ON activity_timeline(train_id, rake_serial_number, indent_number);
    END IF;
END $$;
