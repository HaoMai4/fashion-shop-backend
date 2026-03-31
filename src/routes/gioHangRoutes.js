const express = require("express");
const router = express.Router();

const {
  createCart,
  addToCart,
  getCart
} = require("../controllers/gioHangController");

const authMiddleware = require("../middlewares/authMiddleware");

router.post("/", authMiddleware, createCart);
router.post("/add", authMiddleware, addToCart);
router.get("/", authMiddleware, getCart);

module.exports = router;