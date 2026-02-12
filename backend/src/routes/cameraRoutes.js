const express = require("express");
const router = express.Router();
const cameraController = require("../controllers/cameraController");

router.get("/cameras", cameraController.getCameras);
// Additional camera routes will be added as handlers are extracted

module.exports = router;
