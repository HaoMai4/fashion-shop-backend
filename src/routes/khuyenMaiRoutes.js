const express = require("express");
const router = express.Router();
const kmController = require("../controllers/khuyenMaiController");

router.post("/", kmController.createKhuyenMai);
router.get("/", kmController.getAllKhuyenMai);
router.put("/:id", kmController.updateKhuyenMai);
router.delete("/:id", kmController.deleteKhuyenMai);

module.exports = router;