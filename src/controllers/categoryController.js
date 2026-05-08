const Category = require("../models/Category");
const Product = require("../models/Product");

const CATEGORY_GROUPS = ["nam", "nu", "the-thao", "phu-kien", "unisex"];
const CATEGORY_TYPES = ["ao", "quan", "vay", "phu-kien", "do-the-thao", "khac"];

const slugify = (str = "") =>
  str
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const normalizeGroup = (value) => {
  const group = String(value || "unisex").trim();
  return CATEGORY_GROUPS.includes(group) ? group : "unisex";
};

const normalizeType = (value) => {
  const type = String(value || "khac").trim();
  return CATEGORY_TYPES.includes(type) ? type : "khac";
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const buildTree = (categories = []) => {
  const map = new Map();

  categories.forEach((category) => {
    const item = category.toObject ? category.toObject() : { ...category };
    item.children = [];
    map.set(String(item._id), item);
  });

  const roots = [];

  map.forEach((item) => {
    const parentKey = item.parentId ? String(item.parentId?._id || item.parentId) : null;

    if (parentKey && map.has(parentKey)) {
      map.get(parentKey).children.push(item);
    } else {
      roots.push(item);
    }
  });

  const sortTree = (items) => {
    items.sort((a, b) => {
      const sortA = Number(a.sortOrder || 0);
      const sortB = Number(b.sortOrder || 0);

      if (sortA !== sortB) return sortA - sortB;

      return String(a.name || "").localeCompare(String(b.name || ""), "vi");
    });

    items.forEach((item) => sortTree(item.children || []));
  };

  sortTree(roots);

  return roots;
};

const resolveParentInfo = async (parentId) => {
  if (!parentId) {
    return {
      parent: null,
      level: 1,
      pathPrefix: "",
      group: null,
      type: null,
    };
  }

  const parent = await Category.findById(parentId);

  if (!parent) {
    const error = new Error("Danh mục cha không tồn tại");
    error.statusCode = 400;
    throw error;
  }

  return {
    parent,
    level: Number(parent.level || 1) + 1,
    pathPrefix: parent.path || parent.slug,
    group: parent.group,
    type: parent.type,
  };
};

const isDescendantCategory = async (categoryId, possibleParentId) => {
  if (!possibleParentId) return false;

  let current = await Category.findById(possibleParentId).select("parentId");

  while (current?.parentId) {
    if (String(current.parentId) === String(categoryId)) {
      return true;
    }

    current = await Category.findById(current.parentId).select("parentId");
  }

  return false;
};

const updateChildrenPathAndLevel = async (parentCategory) => {
  const children = await Category.find({ parentId: parentCategory._id });

  for (const child of children) {
    child.level = Number(parentCategory.level || 1) + 1;
    child.path = `${parentCategory.path}/${child.slug}`;

    if (!child.group || child.group === "unisex") {
      child.group = parentCategory.group || "unisex";
    }

    if (!child.type || child.type === "khac") {
      child.type = parentCategory.type || "khac";
    }

    await child.save();
    await updateChildrenPathAndLevel(child);
  }
};

exports.createCategory = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const slug = slugify(req.body.slug || name);
    const parentId = req.body.parentId || null;

    if (!name) {
      return res.status(400).json({ message: "Vui lòng nhập tên danh mục" });
    }

    if (!slug) {
      return res.status(400).json({ message: "Slug không hợp lệ" });
    }

    const existed = await Category.findOne({ slug });
    if (existed) {
      return res.status(400).json({ message: "Slug đã tồn tại" });
    }

    const parentInfo = await resolveParentInfo(parentId);

    const group = req.body.group
      ? normalizeGroup(req.body.group)
      : normalizeGroup(parentInfo.group || "unisex");

    const type = req.body.type
      ? normalizeType(req.body.type)
      : normalizeType(parentInfo.type || "khac");

    const path =
      String(req.body.path || "").trim() ||
      (parentInfo.pathPrefix ? `${parentInfo.pathPrefix}/${slug}` : slug);

    const category = await Category.create({
      name,
      slug,
      path,
      parentId: parentInfo.parent?._id || null,
      level: parentInfo.level,
      group,
      type,
      sortOrder: toNumber(req.body.sortOrder, 0),
      status: req.body.status === "inactive" ? "inactive" : "active",
    });

    return res.status(201).json({
      message: "Tạo danh mục thành công",
      category,
      data: category,
    });
  } catch (err) {
    console.error("createCategory error:", err);
    return res.status(err.statusCode || 400).json({
      message: err.message || "Không thể tạo danh mục",
    });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.group) {
      filter.group = req.query.group;
    }

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.parentId === "null") {
      filter.parentId = null;
    } else if (req.query.parentId) {
      filter.parentId = req.query.parentId;
    }

    const categories = await Category.find(filter)
      .populate("parentId", "name slug path level group type")
      .sort({ level: 1, sortOrder: 1, path: 1, name: 1 });

    const productCounts = await Product.aggregate([
      {
        $group: {
          _id: "$categoryId",
          count: { $sum: 1 },
        },
      },
    ]);

    const productCountMap = new Map(
      productCounts.map((item) => [String(item._id), item.count])
    );

    const childCounts = await Category.aggregate([
      {
        $match: {
          parentId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$parentId",
          count: { $sum: 1 },
        },
      },
    ]);

    const childCountMap = new Map(
      childCounts.map((item) => [String(item._id), item.count])
    );

    const enrichedCategories = categories.map((category) => {
      const obj = category.toObject();

      const productCount = productCountMap.get(String(category._id)) || 0;
      const childrenCount = childCountMap.get(String(category._id)) || 0;

      return {
        ...obj,
        productCount,
        childrenCount,
        canDelete: productCount === 0 && childrenCount === 0,
      };
    });

    if (req.query.tree === "true") {
      const tree = buildTree(enrichedCategories);

      return res.json({
        categories: tree,
        data: tree,
      });
    }

    return res.json(enrichedCategories);
  } catch (err) {
    console.error("getCategories error:", err);
    return res.status(500).json({
      message: err.message || "Không thể tải danh mục",
    });
  }
};

exports.getCategoryTree = async (req, res) => {
  try {
    const categories = await Category.find({})
      .populate("parentId", "name slug path level group type")
      .sort({ level: 1, sortOrder: 1, path: 1, name: 1 });

    const productCounts = await Product.aggregate([
      {
        $group: {
          _id: "$categoryId",
          count: { $sum: 1 },
        },
      },
    ]);

    const productCountMap = new Map(
      productCounts.map((item) => [String(item._id), item.count])
    );

    const childCounts = await Category.aggregate([
      {
        $match: {
          parentId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$parentId",
          count: { $sum: 1 },
        },
      },
    ]);

    const childCountMap = new Map(
      childCounts.map((item) => [String(item._id), item.count])
    );

    const enrichedCategories = categories.map((category) => {
      const obj = category.toObject();

      const productCount = productCountMap.get(String(category._id)) || 0;
      const childrenCount = childCountMap.get(String(category._id)) || 0;

      return {
        ...obj,
        productCount,
        childrenCount,
        canDelete: productCount === 0 && childrenCount === 0,
      };
    });

    const tree = buildTree(enrichedCategories);

    return res.json({
      categories: tree,
      data: tree,
    });
  } catch (err) {
    console.error("getCategoryTree error:", err);
    return res.status(500).json({
      message: err.message || "Không thể tải cây danh mục",
    });
  }
};

exports.getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug }).populate(
      "parentId",
      "name slug path level group type"
    );

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

    const name =
      req.body.name !== undefined ? String(req.body.name).trim() : undefined;

    const newSlug =
      req.body.slug !== undefined ? slugify(req.body.slug) : undefined;

    if (name !== undefined && !name) {
      return res.status(400).json({ message: "Tên danh mục không được để trống" });
    }

    if (newSlug !== undefined && !newSlug) {
      return res.status(400).json({ message: "Slug không hợp lệ" });
    }

    if (newSlug && newSlug !== currentSlug) {
      const existed = await Category.findOne({
        slug: newSlug,
        _id: { $ne: category._id },
      });

      if (existed) {
        return res.status(400).json({ message: "Slug đã tồn tại" });
      }

      category.slug = newSlug;
    }

    if (name !== undefined) {
      category.name = name;
    }

    if (req.body.parentId !== undefined) {
      const nextParentId = req.body.parentId || null;

      if (nextParentId && String(nextParentId) === String(category._id)) {
        return res.status(400).json({
          message: "Danh mục không thể là cha của chính nó",
        });
      }

      const movingIntoOwnChild = await isDescendantCategory(
        category._id,
        nextParentId
      );

      if (movingIntoOwnChild) {
        return res.status(400).json({
          message: "Không thể chuyển danh mục vào danh mục con của chính nó",
        });
      }

      const parentInfo = await resolveParentInfo(nextParentId);

      category.parentId = parentInfo.parent?._id || null;
      category.level = parentInfo.level;

      if (req.body.group === undefined && parentInfo.group) {
        category.group = normalizeGroup(parentInfo.group);
      }

      if (req.body.type === undefined && parentInfo.type) {
        category.type = normalizeType(parentInfo.type);
      }
    }

    if (req.body.group !== undefined) {
      category.group = normalizeGroup(req.body.group);
    }

    if (req.body.type !== undefined) {
      category.type = normalizeType(req.body.type);
    }

    if (req.body.sortOrder !== undefined) {
      category.sortOrder = toNumber(req.body.sortOrder, 0);
    }

    if (req.body.status !== undefined) {
      category.status = req.body.status === "inactive" ? "inactive" : "active";
    }

    if (req.body.path !== undefined) {
      const path = String(req.body.path || "").trim();

      if (!path) {
        return res.status(400).json({ message: "Path không được để trống" });
      }

      category.path = path;
    } else {
      const parent = category.parentId
        ? await Category.findById(category.parentId)
        : null;

      category.path = parent?.path
        ? `${parent.path}/${category.slug}`
        : category.slug;
    }

    await category.save();
    await updateChildrenPathAndLevel(category);

    const updatedCategory = await Category.findById(category._id).populate(
      "parentId",
      "name slug path level group type"
    );

    return res.json({
      message: "Cập nhật danh mục thành công",
      category: updatedCategory,
      data: updatedCategory,
    });
  } catch (err) {
    console.error("updateCategory error:", err);
    return res.status(err.statusCode || 400).json({
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

    const childCount = await Category.countDocuments({
      parentId: category._id,
    });

    if (childCount > 0) {
      return res.status(400).json({
        message: "Không thể xóa danh mục đang có danh mục con",
      });
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