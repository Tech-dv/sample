# Database Migrations

This directory contains SQL migration scripts for updating the database schema.

## Running Migrations

To run a migration, connect to your PostgreSQL database and execute the SQL file:

```bash
# Using psql command line
psql -U postgres -d sack_count_db -f add_customer_id_to_wagon_records.sql

# Or using psql interactive mode
psql -U postgres -d sack_count_db
\i add_customer_id_to_wagon_records.sql
```

## Available Migrations

### add_customer_id_to_wagon_records.sql
**Purpose**: Adds `customer_id` column to `wagon_records` table to support multiple indent mode.

**Changes**:
- Adds `customer_id INTEGER` column with foreign key reference to `customers(id)`
- Allows each wagon to have its own customer assignment when not in single indent mode

**Required for**: Single Indent: No feature (multiple indent support)

**Safe to run**: Yes - Uses `IF NOT EXISTS` check to prevent errors if column already exists

