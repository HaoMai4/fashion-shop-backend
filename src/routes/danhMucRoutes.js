const express = require("express");
const router = express.Router();
const dmController = require("../controllers/danhMucController");

router.post("/", dmController.createDanhMuc);
router.get("/", dmController.getAllDanhMuc);
router.put("/:id", dmController.updateDanhMuc);
router.delete("/:id", dmController.deleteDanhMuc);

module.exports = router;