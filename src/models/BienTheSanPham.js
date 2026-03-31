const mongoose = require("mongoose");

const BienTheSchema = new mongoose.Schema({
  sanPhamId: { type: mongoose.Schema.Types.ObjectId, ref: "SanPham" },
  mauSac: String,
  kichThuoc: String,
  soLuong: Number,
  hinhAnh: [String]
}, { timestamps: true });

module.exports = mongoose.models.BienTheSanPham || mongoose.model("BienTheSanPham", BienTheSchema);