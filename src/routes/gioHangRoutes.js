const express = require("express");
const router = express.Router();

const cartController = require("../controllers/gioHangController");
const protect = require("../middlewares/authMiddleware");

router.post("/add", protect, cartController.addToCart);
router.get("/", protect, cartController.getCart);
router.put("/update/:id", protect, cartController.updateCartItem);
router.delete("/remove/:id", protect, cartController.removeFromCart);

module.exports = router;

console.log("Giỏ hàng routes loaded");