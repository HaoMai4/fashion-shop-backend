const SanPham = require("../models/SanPham");

exports.createProduct = async (req, res) => {
  try {
    const product = await SanPham.create(req.body);
    res.json(product);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    const products = await SanPham.find().populate("danhMucId");
    res.json(products);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await SanPham.findById(req.params.id);
    res.json(product);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await SanPham.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(product);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    await SanPham.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};