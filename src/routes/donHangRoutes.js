const express = require("express");
const router = express.Router();

const donHangController = require("../controllers/donHangController");
const protect = require("../middlewares/authMiddleware");

// Tạo đơn
router.post("/", protect, donHangController.createOrder);

// Lấy đơn của user
router.get("/my", protect, donHangController.getMyOrders);

// Admin xem tất cả
router.get("/", donHangController.getOrders);

// Cập nhật trạng thái
router.put("/:id/status", donHangController.updateOrderStatus);

// Đặt hàng từ giỏ hàng
router.post("/checkout", protect, donHangController.createOrderFromCart);

module.exports = router;

console.log("Đơn hàng routes loaded");