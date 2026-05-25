const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const campaignController = require("../controllers/campaignController");
const { authMiddleware, adminOnly } = require("../middlewares/authMiddleware");

const uploadDir = path.resolve(process.cwd(), "uploads", "campaigns");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, "-");

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  const allowedExts = [".xlsx", ".xls"];
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
  ];

  if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
    return cb(null, true);
  }

  return cb(new Error("Chỉ được upload file Excel .xlsx hoặc .xls"), false);
};

const uploadExcel = multer({
  storage,
  fileFilter,
  limits: {
    files: 1,
    fileSize: 20 * 1024 * 1024,
  },
});

router.use(authMiddleware, adminOnly);

router.get("/", campaignController.listCampaigns);
router.post(
  "/import-excel",
  uploadExcel.single("file"),
  campaignController.importCampaignExcel
);
router.get("/:id", campaignController.getCampaignById);
router.post("/", campaignController.createCampaign);
router.put("/:id", campaignController.updateCampaign);
router.patch("/:id/status", campaignController.updateCampaignStatus);
router.post("/:id/apply-sale", campaignController.applySaleFromCampaign);
router.delete("/:id", campaignController.deleteCampaign);

module.exports = router;