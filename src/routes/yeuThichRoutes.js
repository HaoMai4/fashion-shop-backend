const express = require("express");
const router = express.Router();
const ytController = require("../controllers/yeuThichController");

// cần middleware auth (giả sử bạn có)
const protect = require("../middlewares/authMiddleware");

router.post("/", protect, ytController.addToWishlist);
router.get("/", protect, ytController.getWishlist);
router.delete("/:id", protect, ytController.removeFromWishlist);

module.exports = router;

console.log("Yêu thích routes loaded");