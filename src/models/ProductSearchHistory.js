const mongoose = require("mongoose");

const productSearchHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    keyword: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedKeyword: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    count: {
      type: Number,
      default: 1,
    },
    lastSearchedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

productSearchHistorySchema.index(
  { userId: 1, normalizedKeyword: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "ProductSearchHistory",
  productSearchHistorySchema
);