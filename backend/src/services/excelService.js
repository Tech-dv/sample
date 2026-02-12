const fs = require("fs");
const XLSX = require("xlsx");
const pool = require("../config/database");

/* =====================================================
   HELPER: Update Excel Template with Customers_Master Sheet
===================================================== */
async function updateExcelWithCustomers(excelFilePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(excelFilePath)) {
      console.warn(`Excel file not found: ${excelFilePath}, skipping update`);
      return;
    }

    // Read existing Excel file
    const workbook = XLSX.readFile(excelFilePath);

    // Fetch all customers from database
    const customersRes = await pool.query(
      "SELECT id, customer_name FROM customers ORDER BY id ASC"
    );

    // Prepare Customers_Master sheet data
    const customersData = [
      ["Customer Name", "Customer ID"], // Header row
      ...customersRes.rows.map(c => [c.customer_name, c.id]) // Data rows
    ];

    // Create worksheet from data
    const customersSheet = XLSX.utils.aoa_to_sheet(customersData);

    // Remove existing Customers_Master sheet if it exists
    if (workbook.SheetNames.includes("Customers_Master")) {
      delete workbook.Sheets["Customers_Master"];
      const index = workbook.SheetNames.indexOf("Customers_Master");
      workbook.SheetNames.splice(index, 1);
    }

    // Add Customers_Master sheet
    workbook.SheetNames.push("Customers_Master");
    workbook.Sheets["Customers_Master"] = customersSheet;

    // Write updated workbook back to file
    XLSX.writeFile(workbook, excelFilePath);

    console.log(`Updated ${excelFilePath} with ${customersRes.rows.length} customers`);
  } catch (err) {
    console.error(`Error updating Excel file ${excelFilePath}:`, err);
    // Don't throw - allow customer creation to succeed even if Excel update fails
  }
}

module.exports = {
  updateExcelWithCustomers,
};
