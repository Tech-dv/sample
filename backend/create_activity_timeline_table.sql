-- Create activity_timeline table to track all activities
-- Each activity (submit, revoke, etc.) is stored as a separate entry

CREATE TABLE IF NOT EXISTS activity_timeline (
  id SERIAL PRIMARY KEY,
  rake_serial_number TEXT NOT NULL,
  indent_number TEXT,
  activity_type TEXT NOT NULL, -- 'SUBMITTED', 'REVOKED', 'APPROVED', 'REJECTED', etc.
  username TEXT NOT NULL,
  activity_time TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_activity_rake_serial ON activity_timeline(rake_serial_number);
CREATE INDEX IF NOT EXISTS idx_activity_rake_serial_indent ON activity_timeline(rake_serial_number, indent_number);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_timeline(activity_time DESC);

-- Add comments
COMMENT ON TABLE activity_timeline IS 'Stores all activity timeline entries for train records';
COMMENT ON COLUMN activity_timeline.activity_type IS 'Type of activity: SUBMITTED, REVOKED, APPROVED, REJECTED, etc.';
COMMENT ON COLUMN activity_timeline.username IS 'Username of the user who performed the activity';
COMMENT ON COLUMN activity_timeline.activity_time IS 'Timestamp when the activity occurred';

