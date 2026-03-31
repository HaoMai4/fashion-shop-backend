const mongoose = require("mongoose");

const SanPhamSchema = new mongoose.Schema({
  tenSP: String,
  thuongHieu: String,
  danhMucId: { type: mongoose.Schema.Types.ObjectId, ref: "DanhMuc" },
  giaTien: Number,
  moTaSP: String,
  ngayNhap: Date
}, { timestamps: true });

module.exports =  mongoose.models.SanPham || mongoose.model("SanPham", SanPhamSchema);