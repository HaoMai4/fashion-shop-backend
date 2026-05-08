require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../src/models/Category");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const tree = [
  {
    name: "Nam",
    slug: "nam",
    group: "nam",
    type: "khac",
    sortOrder: 1,
    children: [
      {
        name: "Áo Nam",
        slug: "ao-nam",
        group: "nam",
        type: "ao",
        sortOrder: 1,
        children: [
          { name: "Áo Thun Nam", slug: "ao-thun-nam", group: "nam", type: "ao", sortOrder: 1 },
          { name: "Áo Polo Nam", slug: "ao-polo-nam", group: "nam", type: "ao", sortOrder: 2 },
          { name: "Áo Sơ Mi Nam", slug: "ao-so-mi-nam", group: "nam", type: "ao", sortOrder: 3 },
          { name: "Áo Hoodie Nam", slug: "ao-hoodie-nam", group: "nam", type: "ao", sortOrder: 4 },
          { name: "Áo Khoác Nam", slug: "ao-khoac-nam", group: "nam", type: "ao", sortOrder: 5 },
        ],
      },
      {
        name: "Quần Nam",
        slug: "quan-nam",
        group: "nam",
        type: "quan",
        sortOrder: 2,
        children: [
          { name: "Quần Jeans Nam", slug: "quan-jeans-nam", group: "nam", type: "quan", sortOrder: 1 },
          { name: "Quần Jogger Nam", slug: "quan-jogger-nam", group: "nam", type: "quan", sortOrder: 2 },
          { name: "Quần Short Nam", slug: "quan-short-nam", group: "nam", type: "quan", sortOrder: 3 },
          { name: "Quần Tây Âu Nam", slug: "quan-tay-au-nam", group: "nam", type: "quan", sortOrder: 4 },
        ],
      },
    ],
  },
  {
    name: "Nữ",
    slug: "nu",
    group: "nu",
    type: "khac",
    sortOrder: 2,
    children: [
      {
        name: "Áo Nữ",
        slug: "ao-nu",
        group: "nu",
        type: "ao",
        sortOrder: 1,
        children: [
          { name: "Áo Thun Nữ", slug: "ao-thun-nu", group: "nu", type: "ao", sortOrder: 1 },
          { name: "Áo Polo Nữ", slug: "ao-polo-nu", group: "nu", type: "ao", sortOrder: 2 },
          { name: "Áo Sơ Mi Nữ", slug: "ao-so-mi-nu", group: "nu", type: "ao", sortOrder: 3 },
          { name: "Áo Hoodie Nữ", slug: "ao-hoodie-nu", group: "nu", type: "ao", sortOrder: 4 },
          { name: "Áo Khoác Nữ", slug: "ao-khoac-nu", group: "nu", type: "ao", sortOrder: 5 },
          { name: "Áo Chống Nắng Nữ", slug: "ao-chong-nang-nu", group: "nu", type: "ao", sortOrder: 6 },
          { name: "Áo Giữ Nhiệt Nữ", slug: "ao-giu-nhiet-nu", group: "nu", type: "ao", sortOrder: 7 },
        ],
      },
      {
        name: "Quần/Váy Nữ",
        slug: "quan-vay-nu",
        group: "nu",
        type: "vay",
        sortOrder: 2,
        children: [
          { name: "Váy", slug: "vay", group: "nu", type: "vay", sortOrder: 1 },
          { name: "Đầm Nữ", slug: "dam-nu", group: "nu", type: "vay", sortOrder: 2 },
          { name: "Quần Short Nữ", slug: "quan-short-nu", group: "nu", type: "quan", sortOrder: 3 },
          { name: "Quần Dài Nữ", slug: "quan-dai-nu", group: "nu", type: "quan", sortOrder: 4 },
        ],
      },
    ],
  },
  {
    name: "Thể thao",
    slug: "the-thao",
    group: "the-thao",
    type: "do-the-thao",
    sortOrder: 3,
    children: [
      { name: "Đồ thể thao Nam", slug: "do-the-thao-nam", group: "the-thao", type: "do-the-thao", sortOrder: 1 },
      { name: "Đồ thể thao Nữ", slug: "do-the-thao-nu", group: "the-thao", type: "do-the-thao", sortOrder: 2 },
      { name: "Phụ kiện thể thao", slug: "phu-kien-the-thao", group: "the-thao", type: "phu-kien", sortOrder: 3 },
    ],
  },
  {
    name: "Phụ kiện",
    slug: "phu-kien",
    group: "phu-kien",
    type: "phu-kien",
    sortOrder: 4,
    children: [
      { name: "Phụ Kiện Nam", slug: "phu-kien-nam", group: "phu-kien", type: "phu-kien", sortOrder: 1 },
      { name: "Phụ Kiện Nữ", slug: "phu-kien-nu", group: "phu-kien", type: "phu-kien", sortOrder: 2 },
      { name: "Phụ Kiện Unisex", slug: "phu-kien-unisex", group: "phu-kien", type: "phu-kien", sortOrder: 3 },
      { name: "Giày và dép", slug: "giay-va-dep", group: "phu-kien", type: "phu-kien", sortOrder: 4 },
    ],
  },
];

async function upsertNode(node, parent = null) {
  const level = parent ? Number(parent.level || 1) + 1 : 1;
  const path = parent ? `${parent.path}/${node.slug}` : node.slug;

  const category = await Category.findOneAndUpdate(
    { slug: node.slug },
    {
      $set: {
        name: node.name,
        slug: node.slug,
        path,
        parentId: parent ? parent._id : null,
        level,
        group: node.group,
        type: node.type,
        sortOrder: node.sortOrder || 0,
        status: "active",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  console.log(`${"  ".repeat(level - 1)}- ${category.name} | ${category.slug} | level=${category.level} | group=${category.group} | path=${category.path}`);

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      await upsertNode(child, category);
    }
  }

  return category;
}

async function main() {
  if (!MONGO_URI) {
    throw new Error("Thiếu MONGO_URI hoặc MONGODB_URI trong .env");
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  for (const root of tree) {
    await upsertNode(root);
  }

  const knownSlugs = new Set();

  function collect(nodes) {
    for (const node of nodes) {
      knownSlugs.add(node.slug);
      if (Array.isArray(node.children)) collect(node.children);
    }
  }

  collect(tree);

  const outside = await Category.find({
    slug: { $nin: Array.from(knownSlugs) },
  }).sort({ slug: 1 });

  if (outside.length) {
    console.log("\nCác danh mục chưa được đưa vào cây:");
    outside.forEach((category) => {
      console.log(`- ${category.name} | ${category.slug} | path=${category.path}`);
    });
  } else {
    console.log("\nTất cả danh mục đã nằm trong cây định nghĩa.");
  }

  await mongoose.disconnect();
  console.log("Done");
}

main().catch(async (error) => {
  console.error("Migrate category tree error:", error);
  await mongoose.disconnect();
  process.exit(1);
});