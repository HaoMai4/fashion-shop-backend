const express = require("express");
const router = express.Router();

const {
  createOrder,
  previewCampaignGifts,
  getMyOrders,
  getMyOrderByCode,
  getOrderById,
  getOrderByCode,
  getOrderInvoice,
  handlePayOSWebhook,
  checkPaymentStatus,
  cancelOrder,
  requestOrderCancellation,
  getOrdersAdmin,
  updateOrderStatus,
  getOrderReportsAdmin,
  approveOrderReport,
  rejectOrderReport,
} = require("../controllers/orderController");

const {
  authMiddleware,
  authOptional,
  adminOnly,
} = require("../middlewares/authMiddleware");

const statisController = require("../controllers/statisController");

// Create order
router.post("/create-orders", authOptional, createOrder);

// Preview campaign gifts
router.post("/preview-campaign-gifts", authOptional, previewCampaignGifts);

// PayOS webhook
router.post("/payos/webhook", handlePayOSWebhook);

// Invoice
router.get("/invoice", authOptional, getOrderInvoice);

// Admin order routes
router.get("/admin", authMiddleware, adminOnly, getOrdersAdmin);
router.patch("/admin/:id/status", authMiddleware, adminOnly, updateOrderStatus);

// Admin order report routes
router.get("/admin/reports", authMiddleware, adminOnly, getOrderReportsAdmin);
router.patch("/admin/reports/:id/approve", authMiddleware, adminOnly, approveOrderReport);
router.patch("/admin/reports/:id/reject", authMiddleware, adminOnly, rejectOrderReport);

// Admin stats routes
router.get("/stats/overview", authMiddleware, adminOnly, statisController.getAdminStats);
router.get("/stats/sales", authMiddleware, adminOnly, statisController.getSalesByPeriod);
router.get("/stats/top-products", authMiddleware, adminOnly, statisController.getTopProducts);

// User order routes
router.get("/", authMiddleware, getMyOrders);
router.get("/my-orders/:orderCode", authMiddleware, getMyOrderByCode);
router.get("/code/:orderCode", getOrderByCode);
router.get("/payment-status/:orderCode", checkPaymentStatus);
router.get("/:id", authMiddleware, getOrderById);
router.post("/:id/cancel", authMiddleware, cancelOrder);
router.post("/:id/report", authMiddleware, requestOrderCancellation);

module.exports = router;