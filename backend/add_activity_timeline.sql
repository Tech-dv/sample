-- Add Activity Timeline columns to dispatch_records table
-- Use Case: BCS007 - System will capture the username along with timestamp at the time of record submission

ALTER TABLE dispatch_records 
ADD COLUMN IF NOT EXISTS submitted_by TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_dispatch_submitted_at ON dispatch_records(submitted_at);

-- Add comment
COMMENT ON COLUMN dispatch_records.submitted_by IS 'Username of the user who submitted the record for review';
COMMENT ON COLUMN dispatch_records.submitted_at IS 'Timestamp when the record was submitted for review';

