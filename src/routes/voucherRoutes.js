const express = require("express");
const router = express.Router();

const voucherCtrl = require("../controllers/voucherController");
const { authMiddleware, adminOnly } = require("../middlewares/authMiddleware");

// Customer routes
// Public để guest checkout cũng có thể áp dụng voucher
router.post("/apply", voucherCtrl.applyVoucher);

// Logged-in user routes
router.get("/my", authMiddleware, voucherCtrl.getUserVouchers);
router.post("/redeem", authMiddleware, voucherCtrl.redeemVoucher);

// Admin routes
router.post("/", authMiddleware, adminOnly, voucherCtrl.createVoucher);
router.get("/", authMiddleware, adminOnly, voucherCtrl.getAllVouchers);
router.put("/:id", authMiddleware, adminOnly, voucherCtrl.updateVoucher);
router.delete("/:id", authMiddleware, adminOnly, voucherCtrl.deleteVoucher);

module.exports = router;