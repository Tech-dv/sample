const express = require("express");
const router = express.Router();
const { allowRoles } = require("../middleware/auth");
const reviewerController = require("../controllers/reviewerController");

router.get("/reviewer/tasks", allowRoles(["REVIEWER"]), reviewerController.getTasks);
router.post("/reviewer/tasks/:trainId/assign", allowRoles(["REVIEWER"]), reviewerController.assignTask);
router.post("/reviewer/tasks/:trainId/approve", allowRoles(["REVIEWER"]), reviewerController.approveTask);
router.post("/reviewer/tasks/:trainId/reject", allowRoles(["REVIEWER"]), reviewerController.rejectTask);
router.post("/reviewer/tasks/:trainId/cancel", allowRoles(["REVIEWER"]), reviewerController.cancelTask);
router.get("/reviewer/train/:trainId", allowRoles(["REVIEWER"]), reviewerController.getReviewerTrain);

module.exports = router;
