const express = require("express");
const router = express.Router();
const { allowRoles } = require("../middleware/auth");
const customerController = require("../controllers/customerController");

router.get("/customers", allowRoles(["ADMIN", "SUPER_ADMIN", "REVIEWER"]), customerController.getCustomers);
router.post("/customers", allowRoles(["SUPER_ADMIN", "ADMIN", "REVIEWER"]), customerController.createCustomer);

module.exports = router;
