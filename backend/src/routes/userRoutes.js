const express = require("express");
const router = express.Router();
const { allowRoles } = require("../middleware/auth");
const userController = require("../controllers/userController");

router.post("/users/reviewer", allowRoles(["REVIEWER"]), userController.createReviewer);
router.post("/users/admin", allowRoles(["REVIEWER"]), userController.createAdmin);
router.post("/users/superadmin", allowRoles(["REVIEWER"]), userController.createSuperAdmin);
router.get("/users", allowRoles(["REVIEWER"]), userController.getAllUsers);
router.patch("/users/:userId/status", allowRoles(["REVIEWER"]), userController.updateUserStatus);

module.exports = router;
