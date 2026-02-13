-- Create dropdown_options table to store configurable dropdown values
-- This table stores commodities, wagon types, and rake types

CREATE TABLE IF NOT EXISTS dropdown_options (
  id SERIAL PRIMARY KEY,
  option_type TEXT NOT NULL, -- 'commodity', 'wagon_type', 'rake_type'
  option_value TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(option_type, option_value)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_dropdown_option_type ON dropdown_options(option_type);

-- Add comments
COMMENT ON TABLE dropdown_options IS 'Stores configurable dropdown options for commodities, wagon types, and rake types';
COMMENT ON COLUMN dropdown_options.option_type IS 'Type of option: commodity, wagon_type, or rake_type';
COMMENT ON COLUMN dropdown_options.option_value IS 'The actual value to display in the dropdown';

-- Insert default rake types
INSERT INTO dropdown_options (option_type, option_value) 
VALUES 
  ('rake_type', 'Full rake'),
  ('rake_type', 'Part rake'),
  ('rake_type', 'Combo rake')
ON CONFLICT (option_type, option_value) DO NOTHING;

-- Insert default commodities
INSERT INTO dropdown_options (option_type, option_value) 
VALUES 
  ('commodity', 'Urea granuals'),
  ('commodity', 'Red MoP'),
  ('commodity', 'DAP'),
  ('commodity', 'NPK'),
  ('commodity', 'NPS'),
  ('commodity', 'TSP'),
  ('commodity', 'AS'),
  ('commodity', 'APS'),
  ('commodity', 'white MoP'),
  ('commodity', 'Urea prilled')
ON CONFLICT (option_type, option_value) DO NOTHING;

-- Insert default wagon types
INSERT INTO dropdown_options (option_type, option_value) 
VALUES 
  ('wagon_type', 'HL'),
  ('wagon_type', 'BCN'),
  ('wagon_type', 'BCNA'),
  ('wagon_type', 'BCNA-HS')
ON CONFLICT (option_type, option_value) DO NOTHING;
