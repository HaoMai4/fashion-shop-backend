const express = require("express");
const router = express.Router();

const productController = require("../controllers/productController");
const reviewController = require("../controllers/reviewController");

const {
  authMiddleware,
  adminOnly,
} = require("../middlewares/authMiddleware");

// Product public routes
router.get("/", productController.getAllProducts);
router.get("/default-variant", productController.getAllProductsWithDefaultVariant);
router.get("/all", productController.getAllProductsFiltered);
router.get("/search", productController.searchProducts);
router.get("/best-sellers", productController.getBestSellers);
router.get("/new", productController.getNewProducts);
router.get("/ml-recommend", productController.mlRecommend);
router.get("/for-you", authMiddleware, productController.getForYouProducts);
router.get("/variant/details", productController.getVariantDetails);

// Product detail routes
router.get("/details/:slug", productController.getProductDetailsBySlug);
router.get("/details/:slug/reviews", reviewController.getReviewsBySlug);

// Review routes
router.get(
  "/reviews/recent-customers",
  reviewController.getLatestFiveCustomerReviews
);

router.get(
  "/reviews",
  authMiddleware,
  adminOnly,
  reviewController.getAllReviews
);

router.post(
  "/:productId/reviews",
  authMiddleware,
  reviewController.createOrUpdateReview
);

router.put(
  "/reviews/:id",
  authMiddleware,
  reviewController.updateReview
);

router.delete(
  "/reviews/:id",
  authMiddleware,
  reviewController.deleteReview
);

router.put(
  "/reviews/:id/reply",
  authMiddleware,
  adminOnly,
  reviewController.replyToReview
);

// Recently viewed
router.post("/recently-viewed", productController.getRecentlyViewedProducts);

// Admin product routes
router.post(
  "/add-product",
  authMiddleware,
  adminOnly,
  productController.createProduct
);

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  productController.updateProduct
);

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  productController.deleteProduct
);

// Dynamic slug route should stay near the bottom
router.get("/:slug", productController.getProductBySlugCategory);

module.exports = router;