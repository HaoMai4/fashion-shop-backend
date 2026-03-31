const mongoose = require("mongoose");

const KhuyenMaiSchema = new mongoose.Schema({
  code: String,
  loaiKhuyenMai: String,
  mucGiamGia: Number,
  thoiGianBatDau: Date,
  thoiGianKetThuc: Date,
  trangThai: Boolean
}, { timestamps: true });

module.exports =  mongoose.models.KhuyenMai || mongoose.model("KhuyenMai", KhuyenMaiSchema);