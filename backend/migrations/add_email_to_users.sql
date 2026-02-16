-- Add email column to users table
-- This migration adds email field for user notifications

-- Add email column (allow NULL initially for existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add comment
COMMENT ON COLUMN users.email IS 'Email address for user notifications and alerts';
