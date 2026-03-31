const mongoose = require("mongoose");

const DanhGiaSchema = new mongoose.Schema({
  nguoiDungId: { type: mongoose.Schema.Types.ObjectId, ref: "KhachHang" },
  sanPhamId: { type: mongoose.Schema.Types.ObjectId, ref: "SanPham" },
  danhGia: Number,
  binhLuan: String
}, { timestamps: true });

module.exports = mongoose.models.DanhGiaSanPham || mongoose.model("DanhGiaSanPham", DanhGiaSchema);