const express = require("express");
const router = express.Router();
const { allowRoles } = require("../middleware/auth");
const userController = require("../controllers/userController");

router.post("/users/reviewer", allowRoles(["SUPER_ADMIN"]), userController.createReviewer);
router.post("/users/admin", allowRoles(["SUPER_ADMIN", "REVIEWER"]), userController.createAdmin);
router.post("/users/superadmin", allowRoles(["SUPER_ADMIN"]), userController.createSuperAdmin);

module.exports = router;
