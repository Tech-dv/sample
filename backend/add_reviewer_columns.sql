-- Add reviewer task management columns to dashboard_records table
ALTER TABLE dashboard_records 
ADD COLUMN IF NOT EXISTS assigned_reviewer VARCHAR(255),
ADD COLUMN IF NOT EXISTS cancellation_remarks TEXT,
ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_assigned_reviewer ON dashboard_records(assigned_reviewer);
CREATE INDEX IF NOT EXISTS idx_status_assigned ON dashboard_records(status, assigned_reviewer);

-- Update existing PENDING_APPROVAL records to be unassigned (if needed)
-- UPDATE dashboard_records SET assigned_reviewer = NULL WHERE status = 'PENDING_APPROVAL' AND assigned_reviewer IS NULL;

