-- Add indent_number column to dispatch_records to support Case 2
-- (Multiple indent numbers with same train_id but different dispatch data)

ALTER TABLE dispatch_records 
ADD COLUMN IF NOT EXISTS indent_number TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_dispatch_train_indent 
ON dispatch_records(train_id, indent_number);
