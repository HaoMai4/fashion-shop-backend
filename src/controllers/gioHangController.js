const GioHang = require("../models/GioHang");
const ChiTietGioHang = require("../models/ChiTietGioHang");
const BienTheSanPham = require("../models/BienTheSanPham");

// Tạo giỏ hàng (ít dùng, vì đã auto tạo trong addToCart)
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
    const { bienTheId, soLuong } = req.body;
    const userId = req.user.id;

    // Validate số lượng
    if (!soLuong || soLuong <= 0) {
      return res.status(400).json({ message: "Số lượng không hợp lệ" });
    }

    // 1. Lấy hoặc tạo giỏ hàng
    let cart = await GioHang.findOne({ nguoiDungId: userId });

    if (!cart) {
      cart = await GioHang.create({ nguoiDungId: userId });
    }

    // 2. Kiểm tra biến thể
    const variant = await BienTheSanPham.findById(bienTheId);
    if (!variant) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }

    if (!variant.gia) {
      return res.status(400).json({ message: "Sản phẩm chưa có giá" });
    }

    // 3. Kiểm tra đã tồn tại trong cart chưa
    let item = await ChiTietGioHang.findOne({
      gioHangId: cart._id,
      bienTheId
    });

    if (item) {
      // update số lượng
      item.soLuong += soLuong;
      item.thanhTien = item.soLuong * variant.gia;
      await item.save();
    } else {
      // tạo mới
      item = await ChiTietGioHang.create({
        gioHangId: cart._id,
        sanPhamId: variant.sanPhamId,
        bienTheId,
        soLuong,
        thanhTien: soLuong * variant.gia
      });
    }

    // Trả về full cart
    const items = await ChiTietGioHang.find({
      gioHangId: cart._id
    })
      .populate("bienTheId")
      .populate("sanPhamId");

    res.json({
      cartId: cart._id,
      items
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Lấy giỏ hàng
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await GioHang.findOne({ nguoiDungId: userId });

    if (!cart) {
      return res.json({
        cartId: null,
        items: []
      });
    }

    const items = await ChiTietGioHang.find({
      gioHangId: cart._id
    })
      .populate("bienTheId")
      .populate("sanPhamId");

    res.json({
      cartId: cart._id,
      items
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Cập nhật số lượng sản phẩm trong giỏ
exports.updateCartItem = async (req, res) => {
  try {
    const { soLuong } = req.body;
    const itemId = req.params.id;
    const userId = req.user.id;

    // Validate
    if (!soLuong || soLuong <= 0) {
      return res.status(400).json({ message: "Số lượng không hợp lệ" });
    }

    // Lấy giỏ của user
    const cart = await GioHang.findOne({ nguoiDungId: userId });
    if (!cart) {
      return res.status(404).json({ message: "Không tìm thấy giỏ hàng" });
    }

    // Lấy item thuộc giỏ này
    const item = await ChiTietGioHang.findOne({
      _id: itemId,
      gioHangId: cart._id
    });

    if (!item) {
      return res.status(404).json({ message: "Item không tồn tại" });
    }

    const variant = await BienTheSanPham.findById(item.bienTheId);

    if (!variant || !variant.gia) {
      return res.status(400).json({ message: "Sản phẩm không hợp lệ" });
    }

    item.soLuong = soLuong;
    item.thanhTien = soLuong * variant.gia;

    await item.save();

    res.json(item);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Xóa sản phẩm khỏi giỏ
exports.removeFromCart = async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.user.id;

    // Lấy giỏ của user
    const cart = await GioHang.findOne({ nguoiDungId: userId });
    if (!cart) {
      return res.status(404).json({ message: "Không tìm thấy giỏ hàng" });
    }

    // Xóa đúng item thuộc giỏ
    const item = await ChiTietGioHang.findOneAndDelete({
      _id: itemId,
      gioHangId: cart._id
    });

    if (!item) {
      return res.status(404).json({ message: "Item không tồn tại" });
    }

    res.json({ message: "Đã xoá khỏi giỏ hàng" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};