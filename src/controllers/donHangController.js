const DonHang = require("../models/DonHang");
const ChiTietDonHang = require("../models/ChiTietDonHang");
const BienTheSanPham = require("../models/BienTheSanPham");
const GioHang = require("../models/GioHang");
const ChiTietGioHang = require("../models/ChiTietGioHang");

// TẠO ĐƠN HÀNG
exports.createOrder = async (req, res) => {
  try {
    const { items, diaChi, phuongThucThanhToan } = req.body;

    // Validate
    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Không có sản phẩm" });
    }

    // Tạo đơn
    const order = await DonHang.create({
      nguoiDungId: req.user.id,
      tongTien: 0,
      diaChi,
      phuongThucThanhToan
    });

    let total = 0;

    // Tạo chi tiết đơn
    for (let item of items) {
      if (!item.soLuong || item.soLuong <= 0) {
        return res.status(400).json({ message: "Số lượng không hợp lệ" });
      }

      const variant = await BienTheSanPham.findById(item.bienTheId);

      if (!variant) {
        return res.status(404).json({ message: "Không tìm thấy biến thể" });
      }

      const tongTien = item.soLuong * variant.gia;

      await ChiTietDonHang.create({
        donHangId: order._id,
        bienTheId: item.bienTheId,
        soLuong: item.soLuong,
        giaTien: variant.gia,
        tongTien
      });

      total += tongTien;
    }

    // Update tổng tiền
    order.tongTien = total;
    await order.save();

    res.json({
      message: "Đặt hàng thành công",
      order
    });

  } catch (err) {
    res.status(500).json(err.message);
  }
};

// LẤY TẤT CẢ ĐƠN (ADMIN)
exports.getOrders = async (req, res) => {
  try {
    const orders = await DonHang.find().populate("nguoiDungId");

    const result = [];

    for (let order of orders) {
      const items = await ChiTietDonHang.find({
        donHangId: order._id
      }).populate("bienTheId");

      result.push({
        ...order._doc,
        items
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// LẤY ĐƠN CỦA USER
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await DonHang.find({
      nguoiDungId: req.user.id
    }).sort({ createdAt: -1 });

    const result = [];

    for (let order of orders) {
      const items = await ChiTietDonHang.find({
        donHangId: order._id
      }).populate("bienTheId");

      result.push({
        ...order._doc,
        items
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// UPDATE TRẠNG THÁI ĐƠN
exports.updateOrderStatus = async (req, res) => {
  try {
    const { trangThai } = req.body;

    const order = await DonHang.findByIdAndUpdate(
      req.params.id,
      { trangThai },
      { new: true }
    );

    res.json(order);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ĐẶT HÀNG TỪ GIỎ HÀNG
exports.createOrderFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { diaChi, phuongThucThanhToan } = req.body;

    // 1. Lấy giỏ hàng
    const cart = await GioHang.findOne({ nguoiDungId: userId });

    if (!cart) {
      return res.status(400).json({ message: "Chưa có giỏ hàng" });
    }

    // 2. Lấy sản phẩm trong giỏ
    const items = await ChiTietGioHang.find({
      gioHangId: cart._id
    });

    if (items.length === 0) {
      return res.status(400).json({ message: "Giỏ hàng trống" });
    }

    // 3. Tạo đơn hàng
    const order = await DonHang.create({
      nguoiDungId: userId,
      tongTien: 0,
      diaChi,
      phuongThucThanhToan
    });

    let total = 0;

    // 4. Tạo chi tiết đơn hàng
    for (let item of items) {
      const variant = await BienTheSanPham.findById(item.bienTheId);

      if (!variant) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
      }

      const tongTien = item.soLuong * variant.gia;

      await ChiTietDonHang.create({
        donHangId: order._id,
        bienTheId: item.bienTheId,
        soLuong: item.soLuong,
        giaTien: variant.gia,
        tongTien
      });

      total += tongTien;
    }

    // 5. Update tổng tiền
    order.tongTien = total;
    await order.save();

    // 6. XÓA GIỎ HÀNG (QUAN TRỌNG)
    await ChiTietGioHang.deleteMany({ gioHangId: cart._id });

    res.json({
      message: "Đặt hàng thành công",
      order
    });

  } catch (err) {
    res.status(500).json(err.message);
  }
};