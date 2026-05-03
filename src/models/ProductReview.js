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
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      trim: true,
      default: "",
    },
    adminReply: {
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      message: {
        type: String,
        trim: true,
      },
      repliedAt: {
        type: Date,
      },
    },
  },
  { timestamps: true }
);

// Mỗi user chỉ có 1 review cho 1 sản phẩm.
// Nếu user đánh giá lại, controller sẽ update review cũ.
productReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

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