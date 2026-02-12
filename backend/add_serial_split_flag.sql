-- Add flag column to track if train has been split into sequential serial numbers
ALTER TABLE dashboard_records 
ADD COLUMN IF NOT EXISTS has_sequential_serials BOOLEAN DEFAULT FALSE;

-- Update existing split trains (trains with serial numbers like TRAIN-001-1)
UPDATE dashboard_records 
SET has_sequential_serials = TRUE 
WHERE train_id ~ '-[0-9]+$';

-- Also update parent trains that have children
UPDATE dashboard_records d1
SET has_sequential_serials = TRUE
WHERE EXISTS (
  SELECT 1 FROM dashboard_records d2 
  WHERE d2.train_id LIKE d1.train_id || '-%'
);

