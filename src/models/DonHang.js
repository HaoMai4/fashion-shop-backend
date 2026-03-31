const mongoose = require("mongoose");

const ChiTietGioHangSchema = new mongoose.Schema({
  gioHangId: { type: mongoose.Schema.Types.ObjectId, ref: "GioHang" },
  sanPhamId: { type: mongoose.Schema.Types.ObjectId, ref: "SanPham" },
  bienTheId: { type: mongoose.Schema.Types.ObjectId, ref: "BienTheSanPham" },
  soLuong: Number,
  thanhTien: Number
}, { timestamps: true });

module.exports =  mongoose.models.DonHang || mongoose.model("DonHang", ChiTietGioHangSchema);