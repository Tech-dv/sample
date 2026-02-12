-- Migration: Remove train_id from all tables except train_session
-- Ensure rake_serial_number exists in all tables and is NOT NULL

-- Step 1: Ensure rake_serial_number exists and is populated in all tables
-- First, populate rake_serial_number from train_id where it's missing

-- Populate rake_serial_number in dashboard_records from train_id if missing (only if train_id column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dashboard_records' AND column_name = 'train_id') THEN
        UPDATE dashboard_records 
        SET rake_serial_number = train_id 
        WHERE rake_serial_number IS NULL OR rake_serial_number = '';
    END IF;
END $$;

-- Populate rake_serial_number in wagon_records from train_id if missing (only if train_id column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wagon_records' AND column_name = 'train_id') THEN
        UPDATE wagon_records 
        SET rake_serial_number = train_id 
        WHERE rake_serial_number IS NULL OR rake_serial_number = '';
    END IF;
END $$;

-- Populate rake_serial_number in dispatch_records from train_id if missing (only if train_id column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dispatch_records' AND column_name = 'train_id') THEN
        UPDATE dispatch_records 
        SET rake_serial_number = train_id 
        WHERE rake_serial_number IS NULL OR rake_serial_number = '';
    END IF;
END $$;

-- Populate rake_serial_number in activity_timeline from train_id if missing (only if train_id column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_timeline' AND column_name = 'train_id') THEN
        UPDATE activity_timeline 
        SET rake_serial_number = train_id 
        WHERE rake_serial_number IS NULL OR rake_serial_number = '';
    END IF;
END $$;

-- Populate rake_serial_number in random_counting_records from train_id if missing
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'random_counting_records' AND column_name = 'train_id') THEN
        -- Add rake_serial_number column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'random_counting_records' AND column_name = 'rake_serial_number') THEN
            ALTER TABLE random_counting_records ADD COLUMN rake_serial_number TEXT;
        END IF;
        
        -- Populate from train_id
        UPDATE random_counting_records 
        SET rake_serial_number = train_id 
        WHERE rake_serial_number IS NULL OR rake_serial_number = '';
    END IF;
END $$;

-- Step 2: Make rake_serial_number NOT NULL where possible
-- (Skip if there are NULL values that can't be populated)

-- Step 3: Drop train_id column from all tables except train_session

-- Drop train_id from dashboard_records
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dashboard_records' AND column_name = 'train_id') THEN
        ALTER TABLE dashboard_records DROP COLUMN train_id;
        RAISE NOTICE 'Dropped train_id column from dashboard_records';
    END IF;
END $$;

-- Drop train_id from wagon_records
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wagon_records' AND column_name = 'train_id') THEN
        ALTER TABLE wagon_records DROP COLUMN train_id;
        RAISE NOTICE 'Dropped train_id column from wagon_records';
    END IF;
END $$;

-- Drop train_id from dispatch_records
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dispatch_records' AND column_name = 'train_id') THEN
        ALTER TABLE dispatch_records DROP COLUMN train_id;
        RAISE NOTICE 'Dropped train_id column from dispatch_records';
    END IF;
END $$;

-- Drop train_id from activity_timeline
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_timeline' AND column_name = 'train_id') THEN
        ALTER TABLE activity_timeline DROP COLUMN train_id;
        RAISE NOTICE 'Dropped train_id column from activity_timeline';
    END IF;
END $$;

-- Drop train_id from random_counting_records
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'random_counting_records' AND column_name = 'train_id') THEN
        ALTER TABLE random_counting_records DROP COLUMN train_id;
        RAISE NOTICE 'Dropped train_id column from random_counting_records';
    END IF;
END $$;

-- Step 4: Update indexes to use only rake_serial_number
-- Drop composite indexes that include train_id
DROP INDEX IF EXISTS idx_wagon_train_rake;
DROP INDEX IF EXISTS idx_dispatch_train_rake_indent;
DROP INDEX IF EXISTS idx_activity_train_rake_indent;

-- Ensure indexes exist for rake_serial_number
CREATE INDEX IF NOT EXISTS idx_wagon_rake_serial ON wagon_records(rake_serial_number);
CREATE INDEX IF NOT EXISTS idx_dispatch_rake_serial ON dispatch_records(rake_serial_number);
CREATE INDEX IF NOT EXISTS idx_activity_rake_serial ON activity_timeline(rake_serial_number);
CREATE INDEX IF NOT EXISTS idx_dashboard_rake_serial ON dashboard_records(rake_serial_number);

-- Add index for random_counting_records if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'random_counting_records') THEN
        CREATE INDEX IF NOT EXISTS idx_random_counting_rake_serial ON random_counting_records(rake_serial_number);
    END IF;
END $$;

-- Step 5: Add rake_serial_number to train_session if missing (should already exist, but ensure it)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'train_session' AND column_name = 'rake_serial_number') THEN
        ALTER TABLE train_session ADD COLUMN rake_serial_number TEXT;
        CREATE INDEX IF NOT EXISTS idx_train_session_rake_serial ON train_session(rake_serial_number);
    END IF;
END $$;
