const GioHang = require("../models/GioHang");
const ChiTietGioHang = require("../models/ChiTietGioHang");

// Tạo giỏ hàng
exports.createCart = async (req, res) => {
  try {
    const cart = await GioHang.create({ nguoiDungId: req.user.id });
    res.json(cart);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Thêm sản phẩm vào giỏ
exports.addToCart = async (req, res) => {
  try {
    const { gioHangId, sanPhamId, bienTheId, soLuong } = req.body;

    const item = await ChiTietGioHang.create({
      gioHangId,
      sanPhamId,
      bienTheId,
      soLuong
    });

    res.json(item);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Lấy giỏ hàng
exports.getCart = async (req, res) => {
  try {
    const items = await ChiTietGioHang.find({}).populate("sanPhamId bienTheId");
    res.json(items);
  } catch (err) {
    res.status(500).json(err.message);
  }
};