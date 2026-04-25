const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");
const { authMiddleware, adminOnly } = require("../middlewares/authMiddleware");

const {
  createVariant,
  addSizeToVariant,
  updateSizeInVariant,
  removeSizeFromVariant,
  updateVariantImages,
  updateVariant,
  deleteVariant,
  reorderVariantImages,
} = require("../controllers/variantController");

router.post(
  "/add-variant",
  authMiddleware,
  adminOnly,
  upload.array("images", 5),
  createVariant
);

router.put(
  "/update-variant/:variantId",
  authMiddleware,
  adminOnly,
  upload.array("images", 10),
  updateVariant
);

router.post(
  "/:variantId/sizes",
  authMiddleware,
  adminOnly,
  addSizeToVariant
);

router.put(
  "/:variantId/sizes/:sizeId",
  authMiddleware,
  adminOnly,
  updateSizeInVariant
);

router.delete(
  "/:variantId/sizes/:sizeId",
  authMiddleware,
  adminOnly,
  removeSizeFromVariant
);

router.delete(
  "/:variantId",
  authMiddleware,
  adminOnly,
  deleteVariant
);

router.put(
  "/:variantId/images",
  authMiddleware,
  adminOnly,
  upload.array("images", 5),
  updateVariantImages
);

router.put(
  "/:variantId/reorder-images",
  authMiddleware,
  adminOnly,
  reorderVariantImages
);

module.exports = router;