const express = require("express");
const router = express.Router();
const { allowRoles } = require("../middleware/auth");
const dropdownController = require("../controllers/dropdownController");

// Get dropdown options (all users can read, but only reviewers can manage)
router.get("/dropdown-options", allowRoles(["ADMIN", "SUPER_ADMIN", "REVIEWER", "CUSTOMER"]), dropdownController.getDropdownOptions);

// Create dropdown option (only reviewers)
router.post("/dropdown-options", allowRoles(["REVIEWER"]), dropdownController.createDropdownOption);

// Delete dropdown option (only reviewers)
router.delete("/dropdown-options/:id", allowRoles(["REVIEWER"]), dropdownController.deleteDropdownOption);

module.exports = router;
