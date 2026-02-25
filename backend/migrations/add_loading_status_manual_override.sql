-- Migration: Add loading_status_manual_override column to wagon_records
-- This flag tracks whether a user has manually set loading_status to false,
-- so the background poller does not automatically flip it back to true.
-- Logic: poller only auto-sets loading_status=true when
--   condition_met (loaded_bag_count >= wagon_to_be_loaded) AND NOT loading_status_manual_override

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'wagon_records'
        AND column_name = 'loading_status_manual_override'
    ) THEN
        ALTER TABLE wagon_records
        ADD COLUMN loading_status_manual_override BOOLEAN NOT NULL DEFAULT FALSE;

        COMMENT ON COLUMN wagon_records.loading_status_manual_override IS
          'Set to TRUE when a user manually overrides loading_status to false. '
          'Prevents the background poller from auto-resetting it to true.';
    END IF;
END $$;
