const express = require("express");
const router = express.Router();

const {
  createNhanVien,
  getAllNhanVien,
  updateNhanVien,
  loginNhanVien
} = require("../controllers/NhanVienController");

const protect = require("../middlewares/authMiddleware");
const { isManager } = require("../middlewares/roleMiddleware");

// Login
router.post("/login", loginNhanVien);

// Chỉ quản lý mới được tạo nhân viên
router.post("/", protect, isManager, createNhanVien);

// Chỉ quản lý xem danh sách
router.get("/", protect, isManager, getAllNhanVien);

// Chỉ quản lý update nhân viên
router.put("/:id", protect, isManager, updateNhanVien);

module.exports = router;

console.log("Nhân viên routes loaded");