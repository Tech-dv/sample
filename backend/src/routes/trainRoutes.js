const express = require("express");
const router = express.Router();
const { allowRoles, withCustomerContext } = require("../middleware/auth");
const trainController = require("../controllers/trainController");

router.post("/train", trainController.createTrain);
router.get("/train/:trainId/view", withCustomerContext, trainController.viewTrain);
router.get("/train/:trainId/edit", trainController.editTrain);
router.post("/train/:trainId/draft", trainController.saveDraft);
router.get("/train/:trainId/dispatch", trainController.getDispatch);
router.post("/train/:trainId/dispatch/draft", allowRoles(["ADMIN", "REVIEWER", "SUPER_ADMIN"]), trainController.saveDispatchDraft);
router.post("/train/:trainId/dispatch/submit", allowRoles(["ADMIN", "SUPER_ADMIN"]), trainController.submitDispatch);
router.get("/train/:trainId/activity-timeline", allowRoles(["ADMIN", "REVIEWER", "SUPER_ADMIN"]), trainController.getActivityTimeline);
router.get("/train/:trainId/activity-timeline/:activityId/export-changes", allowRoles(["ADMIN", "REVIEWER", "SUPER_ADMIN"]), trainController.exportChanges);
router.get("/train/:trainId/export-all-reviewer-changes", allowRoles(["ADMIN", "REVIEWER", "SUPER_ADMIN"]), trainController.exportAllReviewerChanges);
router.post("/train/:trainId/revoke", allowRoles(["SUPER_ADMIN", "ADMIN"]), trainController.revokeTrain);
router.get("/train/check-sequential-assignments", allowRoles(["ADMIN", "REVIEWER", "SUPER_ADMIN"]), trainController.checkSequentialAssignments);
router.get("/train/:trainId/check-multiple-serials", allowRoles(["ADMIN", "SUPER_ADMIN"]), trainController.checkMultipleSerials);
router.post("/train/:trainId/generate-multiple-rake-serial", allowRoles(["ADMIN", "SUPER_ADMIN"]), trainController.generateMultipleRakeSerial);
router.post("/train/:trainId/mark-serial-handled", allowRoles(["ADMIN", "REVIEWER", "SUPER_ADMIN"]), trainController.markSerialHandled);

module.exports = router;
