const mongoose = require("mongoose");

const ChiTietHoaDonSchema = new mongoose.Schema({
  hoaDonId: { type: mongoose.Schema.Types.ObjectId, ref: "HoaDon" },
  sanPhamId: { type: mongoose.Schema.Types.ObjectId, ref: "SanPham" },
  bienTheId: { type: mongoose.Schema.Types.ObjectId, ref: "BienTheSanPham" },
  soLuong: Number,
  donGia: Number
}, { timestamps: true });

module.exports = mongoose.models.ChiTietHoaDon || mongoose.model("ChiTietHoaDon", ChiTietHoaDonSchema);