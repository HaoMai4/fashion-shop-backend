const Product = require("../models/Product");
const Order = require("../models/Order");
const ProductReview = require("../models/ProductReview");

function getUserId(user) {
  return user?._id || user?.id;
}

async function recalculateProductRating(productId) {
  const reviews = await ProductReview.find({ productId });

  if (!reviews.length) {
    await Product.findByIdAndUpdate(productId, {
      $set: {
        "rating.average": 0,
        "rating.count": 0,
      },
    });
    return;
  }

  const avg =
    reviews.reduce((acc, review) => acc + Number(review.rating || 0), 0) /
    reviews.length;

  await Product.findByIdAndUpdate(productId, {
    $set: {
      "rating.average": Number(avg.toFixed(1)),
      "rating.count": reviews.length,
    },
  });
}

// Create a new product review.
// Current rule: only users who purchased the product in a completed order can review.
exports.createOrUpdateReview = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Auth required" });
    }

    const userId = getUserId(user);

    if (!userId) {
      return res.status(401).json({ message: "Invalid user session" });
    }

    const productId = req.params.productId || req.body?.productId;
    const { slug, rating, comment } = req.body || {};

    if (!productId && !slug) {
      return res.status(400).json({
        message: "productId or slug is required",
      });
    }

    const product = productId
      ? await Product.findById(productId)
      : await Product.findOne({ slug });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const pid = product._id;
    const ratingNumber = Number(rating);

    if (
      !Number.isInteger(ratingNumber) ||
      ratingNumber < 1 ||
      ratingNumber > 5
    ) {
      return res.status(400).json({
        message: "rating must be an integer between 1 and 5",
      });
    }

    const completedStatuses = ["hoan_thanh", "completed", "delivered"];

    const hasPurchased = await Order.exists({
      userId,
      orderStatus: { $in: completedStatuses },
      "items.productId": pid,
    });

    if (!hasPurchased) {
      return res.status(403).json({
        message: "Bạn chỉ có thể đánh giá sản phẩm đã mua và đã hoàn thành.",
      });
    }

    const review = new ProductReview({
      productId: pid,
      userId,
      rating: ratingNumber,
      comment: comment || "",
    });

    await review.save();

    const populatedReview = await ProductReview.findById(review._id)
      .populate("userId", "firstName lastName avatar")
      .populate("productId", "name slug")
      .populate("adminReply.adminId", "firstName lastName avatar")
      .lean();

    return res.status(201).json({
      message: "Review created",
      review: populatedReview,
    });
  } catch (err) {
    console.error("createOrUpdateReview error", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// Update a specific review by review id.
// Owner or admin can update.
exports.updateReview = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Auth required" });
    }

    const userId = getUserId(user);
    const { id } = req.params;
    const { rating, comment } = req.body || {};

    if (!id) {
      return res.status(400).json({ message: "review id required" });
    }

    const review = await ProductReview.findById(id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const isOwner = String(review.userId) === String(userId);
    const isAdmin = user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const ratingNumber = Number(rating);

    if (
      !Number.isInteger(ratingNumber) ||
      ratingNumber < 1 ||
      ratingNumber > 5
    ) {
      return res.status(400).json({
        message: "rating must be an integer between 1 and 5",
      });
    }

    review.rating = ratingNumber;

    if (comment !== undefined) {
      review.comment = comment;
    }

    await review.save();

    const populatedReview = await ProductReview.findById(review._id)
      .populate("userId", "firstName lastName avatar")
      .populate("productId", "name slug")
      .populate("adminReply.adminId", "firstName lastName avatar")
      .lean();

    return res.json({
      message: "Review updated",
      review: populatedReview,
    });
  } catch (err) {
    console.error("updateReview error", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// Get reviews for a product by slug.
exports.getReviewsBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const PAGE = Math.max(1, parseInt(page, 10) || 1);
    const LIMIT = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    const product = await Product.findOne({ slug });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const total = await ProductReview.countDocuments({
      productId: product._id,
    });

    const reviews = await ProductReview.find({ productId: product._id })
      .sort({ createdAt: -1 })
      .skip((PAGE - 1) * LIMIT)
      .limit(LIMIT)
      .populate("userId", "firstName lastName avatar")
      .populate("adminReply.adminId", "firstName lastName avatar")
      .lean();

    return res.json({
      productId: product._id,
      total,
      page: PAGE,
      perPage: LIMIT,
      reviews,
    });
  } catch (err) {
    console.error("getReviewsBySlug error", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// Admin: get all reviews with pagination and optional filters.
exports.getAllReviews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      productId,
      userId,
      minRating,
      maxRating,
      sort = "-createdAt",
    } = req.query;

    const PAGE = Math.max(1, parseInt(page, 10) || 1);
    const LIMIT = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

    const filter = {};

    if (productId) filter.productId = productId;
    if (userId) filter.userId = userId;

    if (minRating || maxRating) {
      filter.rating = {};
      if (minRating) filter.rating.$gte = Number(minRating);
      if (maxRating) filter.rating.$lte = Number(maxRating);
    }

    const total = await ProductReview.countDocuments(filter);

    const reviews = await ProductReview.find(filter)
      .sort(sort)
      .skip((PAGE - 1) * LIMIT)
      .limit(LIMIT)
      .populate("userId", "firstName lastName email avatar")
      .populate("productId", "name slug")
      .populate("adminReply.adminId", "firstName lastName email avatar")
      .lean();

    return res.json({
      total,
      page: PAGE,
      perPage: LIMIT,
      reviews,
    });
  } catch (err) {
    console.error("getAllReviews error", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// Delete review by id. Owner or admin can delete.
exports.deleteReview = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Auth required" });
    }

    const userId = getUserId(user);
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "review id required" });
    }

    const review = await ProductReview.findById(id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const isOwner = String(review.userId) === String(userId);
    const isAdmin = user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const productId = review.productId;

    await ProductReview.findByIdAndDelete(id);
    await recalculateProductRating(productId);

    return res.json({ message: "Review deleted" });
  } catch (err) {
    console.error("deleteReview error", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// Admin reply to a review.
exports.replyToReview = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Auth required" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    const { id } = req.params;
    const { message } = req.body || {};

    if (!id) {
      return res.status(400).json({ message: "review id required" });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "message is required" });
    }

    const review = await ProductReview.findById(id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    review.adminReply = {
      adminId: getUserId(user),
      message: message.trim(),
      repliedAt: new Date(),
    };

    await review.save();

    const populatedReview = await ProductReview.findById(id)
      .populate("userId", "firstName lastName avatar")
      .populate("productId", "name slug")
      .populate("adminReply.adminId", "firstName lastName avatar")
      .lean();

    return res.json({
      message: "Reply saved",
      review: populatedReview,
    });
  } catch (err) {
    console.error("replyToReview error", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// Get latest reviews from 5 most recent distinct customers across the site.
exports.getLatestFiveCustomerReviews = async (req, res) => {
  try {
    const recentReviews = await ProductReview.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("userId", "firstName lastName avatar")
      .populate("productId", "name slug")
      .populate("adminReply.adminId", "firstName lastName avatar")
      .lean();

    const usersSeen = new Set();
    const result = [];

    for (const review of recentReviews) {
      const uid = String(review.userId?._id || review.userId || "");

      if (!uid) continue;
      if (usersSeen.has(uid)) continue;

      usersSeen.add(uid);

      result.push({
        _id: review._id,
        product: review.productId || null,
        user: review.userId || null,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        adminReply: review.adminReply
          ? {
              message: review.adminReply.message || null,
              repliedAt: review.adminReply.repliedAt || null,
              admin: review.adminReply.adminId
                ? {
                    _id:
                      review.adminReply.adminId._id ||
                      review.adminReply.adminId,
                    firstName: review.adminReply.adminId.firstName,
                    lastName: review.adminReply.adminId.lastName,
                    avatar: review.adminReply.adminId.avatar,
                  }
                : null,
            }
          : null,
      });

      if (result.length >= 5) break;
    }

    return res.json({
      count: result.length,
      reviews: result,
    });
  } catch (err) {
    console.error("getLatestFiveCustomerReviews error", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};