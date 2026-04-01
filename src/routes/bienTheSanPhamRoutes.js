const express = require("express");
const router = express.Router();
const bienTheController = require("../controllers/bienTheSanPhamController");

// Tạo biến thể
router.post("/", bienTheController.createVariant);

// Lấy biến thể theo sản phẩm
router.get("/product/:productId", bienTheController.getVariantsByProduct);

// Update
router.put("/:id", bienTheController.updateVariant);

// Delete
router.delete("/:id", bienTheController.deleteVariant);

module.exports = router;

console.log("Biến thể sản phẩm routes loaded");