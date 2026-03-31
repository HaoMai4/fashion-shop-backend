const express = require("express");
const router = express.Router();
const donHangController = require("../controllers/donHangController");
const protect = require("../middlewares/authMiddleware");

router.post("/", protect, donHangController.createOrder);
router.get("/", donHangController.getOrders);
router.get("/my", protect, donHangController.getMyOrders);

module.exports = router;