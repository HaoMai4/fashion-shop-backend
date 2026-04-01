const express = require("express");
const router = express.Router();

const {
  register,
  login,
  getProfile
} = require("../controllers/KhachHangController");

const authMiddleware = require("../middlewares/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.get("/profile", authMiddleware, getProfile);

module.exports = router;

console.log("Khách hàng routes loaded");