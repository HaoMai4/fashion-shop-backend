const mongoose = require("mongoose");

const YeuThichSchema = new mongoose.Schema({
  nguoiDungId: { type: mongoose.Schema.Types.ObjectId, ref: "KhachHang" },
  sanPhamId: { type: mongoose.Schema.Types.ObjectId, ref: "SanPham" }
}, { timestamps: true });

module.exports =  mongoose.models.YeuThich || mongoose.model("YeuThich", YeuThichSchema);