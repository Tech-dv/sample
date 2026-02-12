const express = require("express");
const router = express.Router();
const wagonController = require("../controllers/wagonController");

router.put("/wagon/:trainId/:towerNumber/status", wagonController.updateWagonStatus);

module.exports = router;
