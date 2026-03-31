const mongoose = require("mongoose");

const ChiTietDonHangSchema = new mongoose.Schema({
  donHangId: { type: mongoose.Schema.Types.ObjectId, ref: "DonHang" },
  bienTheId: { type: mongoose.Schema.Types.ObjectId, ref: "BienTheSanPham" },
  soLuong: Number,
  giaTien: Number,
  tongTien: Number
}, { timestamps: true });

module.exports = mongoose.models.ChiTietDonHang || mongoose.model("ChiTietDonHang", ChiTietDonHangSchema);