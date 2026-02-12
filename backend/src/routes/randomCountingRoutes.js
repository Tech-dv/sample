const express = require("express");
const router = express.Router();
const { allowRoles } = require("../middleware/auth");
const randomCountingController = require("../controllers/randomCountingController");

router.get("/random-counting/trains", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.getTrains);
router.get("/random-counting/wagons/:trainId", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.getWagons);
router.get("/random-counting/live-count", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.getLiveCount);
router.post("/random-counting/start", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.startCounting);
router.get("/random-counting/completed", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.getCompleted);
router.get("/random-counting/all", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.getAll);
router.get("/random-counting/:id", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.getById);
router.get("/random-counting/completed/:id", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.getCompletedById);
router.post("/random-counting/complete", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.completeCounting);
router.post("/random-counting/save", allowRoles(["ADMIN", "SUPER_ADMIN"]), randomCountingController.saveCounting);

module.exports = router;
