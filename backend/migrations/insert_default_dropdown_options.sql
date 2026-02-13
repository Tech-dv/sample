-- Insert default dropdown options if they don't already exist
-- This script can be run even if the table already has some data
-- It will only insert values that don't already exist (due to UNIQUE constraint)

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
