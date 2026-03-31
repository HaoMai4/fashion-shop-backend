const express = require("express");
const router = express.Router();

const {
  createNhanVien,
  getAllNhanVien,
  updateNhanVien,
  deleteNhanVien
} = require("../controllers/NhanVienController");

router.post("/", createNhanVien);
router.get("/", getAllNhanVien);
router.put("/:id", updateNhanVien);
router.delete("/:id", deleteNhanVien);

module.exports = router;