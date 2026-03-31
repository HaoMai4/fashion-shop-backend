const BienTheSanPham = require("../models/BienTheSanPham");

exports.createVariant = async (req, res) => {
  try {
    const variant = await BienTheSanPham.create(req.body);
    res.json(variant);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getVariantsByProduct = async (req, res) => {
  try {
    const variants = await BienTheSanPham.find({
      sanPhamId: req.params.productId
    });
    res.json(variants);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.updateVariant = async (req, res) => {
  try {
    const variant = await BienTheSanPham.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(variant);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.deleteVariant = async (req, res) => {
  try {
    await BienTheSanPham.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted variant" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};