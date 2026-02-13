const pool = require("../config/database");

// Get all dropdown options by type
const getDropdownOptions = async (req, res) => {
  const { type } = req.query; // 'commodity', 'wagon_type', or 'rake_type'
  
  try {
    let query;
    let params;
    
    if (type) {
      query = `SELECT id, option_type, option_value, created_at, updated_at 
               FROM dropdown_options 
               WHERE option_type = $1 
               ORDER BY option_value ASC`;
      params = [type];
    } else {
      query = `SELECT id, option_type, option_value, created_at, updated_at 
               FROM dropdown_options 
               ORDER BY option_type, option_value ASC`;
      params = [];
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("GET DROPDOWN OPTIONS ERROR:", err);
    res.status(500).json({ message: "Failed to load dropdown options" });
  }
};

// Create a new dropdown option
const createDropdownOption = async (req, res) => {
  const { option_type, option_value } = req.body;
  const role = req.headers["x-user-role"];
  
  // Only reviewers can create dropdown options
  if (role !== "REVIEWER") {
    return res.status(403).json({ message: "Only reviewers can manage dropdown options" });
  }
  
  if (!option_type || !option_value || !option_value.trim()) {
    return res.status(400).json({ message: "option_type and option_value are required" });
  }
  
  const validTypes = ['commodity', 'wagon_type', 'rake_type'];
  if (!validTypes.includes(option_type)) {
    return res.status(400).json({ message: "option_type must be one of: commodity, wagon_type, rake_type" });
  }
  
  const value = option_value.trim();
  
  try {
    const result = await pool.query(
      `INSERT INTO dropdown_options (option_type, option_value, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id, option_type, option_value, created_at, updated_at`,
      [option_type, value]
    );
    
    res.status(201).json({ 
      message: "Dropdown option created successfully",
      option: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({ message: "This option already exists" });
    }
    console.error("CREATE DROPDOWN OPTION ERROR:", err);
    res.status(500).json({ message: "Failed to create dropdown option" });
  }
};

// Delete a dropdown option
const deleteDropdownOption = async (req, res) => {
  const { id } = req.params;
  const role = req.headers["x-user-role"];
  
  // Only reviewers can delete dropdown options
  if (role !== "REVIEWER") {
    return res.status(403).json({ message: "Only reviewers can manage dropdown options" });
  }
  
  try {
    const result = await pool.query(
      `DELETE FROM dropdown_options WHERE id = $1 RETURNING id, option_type, option_value`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Dropdown option not found" });
    }
    
    res.json({ 
      message: "Dropdown option deleted successfully",
      option: result.rows[0]
    });
  } catch (err) {
    console.error("DELETE DROPDOWN OPTION ERROR:", err);
    res.status(500).json({ message: "Failed to delete dropdown option" });
  }
};

module.exports = {
  getDropdownOptions,
  createDropdownOption,
  deleteDropdownOption,
};
