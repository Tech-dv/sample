const express = require("express");
const router = express.Router();
const { allowRoles } = require("../middleware/auth");
const adminController = require("../controllers/adminController");

router.put("/dashboard-record/:train_id/draft", allowRoles(["ADMIN", "SUPER_ADMIN"]), adminController.saveDraft);
router.post("/admin/apply-sequential-trigger", allowRoles(["ADMIN", "SUPER_ADMIN"]), adminController.applySequentialTrigger);
router.get("/admin/check-sequential-trigger", allowRoles(["ADMIN", "SUPER_ADMIN"]), adminController.checkSequentialTrigger);
router.post("/admin/repair-legacy-sequential-train-ids", allowRoles(["ADMIN", "SUPER_ADMIN"]), adminController.repairLegacySequentialTrainIds);

module.exports = router;
