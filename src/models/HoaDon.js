const mongoose = require("mongoose");

const HoaDonSchema = new mongoose.Schema({
  nhanVienId: { type: mongoose.Schema.Types.ObjectId, ref: "NhanVien" },
  khachHangId: { type: mongoose.Schema.Types.ObjectId, ref: "KhachHang" },
  donHangId: { type: mongoose.Schema.Types.ObjectId, ref: "DonHang" },
  ngayTao: Date,
  tongTien: Number,
  tienThue: Number,
  lePhi: Number
}, { timestamps: true });

module.exports =  mongoose.models.HoaDon || mongoose.model("HoaDon", HoaDonSchema);