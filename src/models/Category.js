const mongoose = require("mongoose");

const CATEGORY_GROUPS = ["nam", "nu", "the-thao", "phu-kien", "unisex"];
const CATEGORY_TYPES = ["ao", "quan", "vay", "phu-kien", "do-the-thao", "khac"];

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    path: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    level: {
      type: Number,
      default: 1,
      min: 1,
    },

    group: {
      type: String,
      enum: CATEGORY_GROUPS,
      default: "unisex",
      index: true,
    },

    type: {
      type: String,
      enum: CATEGORY_TYPES,
      default: "khac",
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

categorySchema.index({ parentId: 1, sortOrder: 1, name: 1 });
categorySchema.index({ group: 1, type: 1, sortOrder: 1 });

module.exports = mongoose.model("Category", categorySchema);