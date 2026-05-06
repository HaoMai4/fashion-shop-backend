const Category = require("../models/Category");
const Product = require("../models/Product");

const slugify = (str = "") =>
  str
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

exports.createCategory = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const slug = slugify(req.body.slug || name);
    const path = String(req.body.path || slug).trim();

    if (!name) {
      return res.status(400).json({ message: "Vui lòng nhập tên danh mục" });
    }

    if (!slug) {
      return res.status(400).json({ message: "Slug không hợp lệ" });
    }

    if (!path) {
      return res.status(400).json({ message: "Vui lòng nhập path danh mục" });
    }

    const existed = await Category.findOne({ slug });
    if (existed) {
      return res.status(400).json({ message: "Slug đã tồn tại" });
    }

    const category = await Category.create({
      name,
      slug,
      path,
    });

    return res.status(201).json({
      message: "Tạo danh mục thành công",
      category,
      data: category,
    });
  } catch (err) {
    console.error("createCategory error:", err);
    return res.status(400).json({
      message: err.message || "Không thể tạo danh mục",
    });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ path: 1, name: 1 });
    return res.json(categories);
  } catch (err) {
    console.error("getCategories error:", err);
    return res.status(500).json({
      message: err.message || "Không thể tải danh mục",
    });
  }
};

exports.getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.json(category);
  } catch (err) {
    console.error("getCategoryBySlug error:", err);
    return res.status(500).json({
      message: err.message || "Không thể tải danh mục",
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const currentSlug = req.params.slug;

    const category = await Category.findOne({ slug: currentSlug });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const name = req.body.name !== undefined ? String(req.body.name).trim() : undefined;
    const path = req.body.path !== undefined ? String(req.body.path).trim() : undefined;
    const newSlug =
      req.body.slug !== undefined ? slugify(req.body.slug) : undefined;

    if (name !== undefined && !name) {
      return res.status(400).json({ message: "Tên danh mục không được để trống" });
    }

    if (newSlug !== undefined && !newSlug) {
      return res.status(400).json({ message: "Slug không hợp lệ" });
    }

    if (path !== undefined && !path) {
      return res.status(400).json({ message: "Path không được để trống" });
    }

    if (newSlug && newSlug !== currentSlug) {
      const existed = await Category.findOne({ slug: newSlug });
      if (existed) {
        return res.status(400).json({ message: "Slug đã tồn tại" });
      }

      category.slug = newSlug;
    }

    if (name !== undefined) {
      category.name = name;
    }

    if (path !== undefined) {
      category.path = path;
    }

    await category.save();

    return res.json({
      message: "Cập nhật danh mục thành công",
      category,
      data: category,
    });
  } catch (err) {
    console.error("updateCategory error:", err);
    return res.status(400).json({
      message: err.message || "Không thể cập nhật danh mục",
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const productCount = await Product.countDocuments({
      categoryId: category._id,
    });

    if (productCount > 0) {
      return res.status(400).json({
        message: "Không thể xóa danh mục đang có sản phẩm",
      });
    }

    await Category.deleteOne({ _id: category._id });

    return res.json({
      message: "Xóa danh mục thành công",
    });
  } catch (err) {
    console.error("deleteCategory error:", err);
    return res.status(500).json({
      message: err.message || "Không thể xóa danh mục",
    });
  }
};