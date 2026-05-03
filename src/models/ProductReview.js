const mongoose = require("mongoose");

const productReviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
    },
    color: {
      type: String,
      default: "",
    },
    colorCode: {
      type: String,
      default: "",
    },
    size: {
      type: String,
      default: "",
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: "",
    },
    adminReply: {
      message: String,
      repliedAt: Date,
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  { timestamps: true }
);

// Không đặt unique index productId + userId.
// Cho phép một user tạo nhiều review cho cùng một sản phẩm.

// Sau khi tạo/cập nhật review, tính lại rating trung bình của sản phẩm.
productReviewSchema.post("save", async function () {
  const Product = require("./Product");

  const reviews = await this.constructor.find({ productId: this.productId });

  if (!reviews.length) {
    await Product.findByIdAndUpdate(this.productId, {
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

  await Product.findByIdAndUpdate(this.productId, {
    $set: {
      "rating.average": Number(avg.toFixed(1)),
      "rating.count": reviews.length,
    },
  });
});

const ProductReview = mongoose.model("ProductReview", productReviewSchema);

module.exports = ProductReview;